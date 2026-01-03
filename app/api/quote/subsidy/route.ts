import { NextRequest, NextResponse } from 'next/server';

// 2024 Federal Poverty Level Guidelines (Continental US)
const FPL_BASE = 15060; // 1 person
const FPL_INCREMENT = 5380; // Each additional person

// 2024 ACA Applicable Percentages (with ARP extension through 2025)
const getApplicablePercentage = (fplPercent: number): number => {
  if (fplPercent <= 150) return 0;
  if (fplPercent <= 200) return 2.0;
  if (fplPercent <= 250) return 4.0;
  if (fplPercent <= 300) return 6.0;
  if (fplPercent <= 400) return 8.5;
  return 8.5; // Above 400% FPL (still eligible under ARP)
};

// Approximate SLCSP by age (national average estimates)
const getSlcspEstimate = (ages: number[]): number => {
  let total = 0;
  ages.forEach(age => {
    if (age < 21) total += 280;
    else if (age < 30) total += 320;
    else if (age < 40) total += 360;
    else if (age < 50) total += 450;
    else if (age < 60) total += 620;
    else total += 850;
  });
  return total;
};

/**
 * POST /api/quote/subsidy
 * Calculate ACA subsidy estimate for health insurance
 *
 * Body: {
 *   householdSize: number,
 *   annualIncome: number,
 *   ages: number[],  // ages of people needing coverage
 *   zipCode?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { householdSize, annualIncome, ages, zipCode } = body;

    // Validate inputs
    if (!householdSize || householdSize < 1) {
      return NextResponse.json({ error: 'Invalid household size' }, { status: 400 });
    }

    if (!annualIncome || annualIncome <= 0) {
      return NextResponse.json({ error: 'Invalid annual income' }, { status: 400 });
    }

    if (!ages || !Array.isArray(ages) || ages.length === 0) {
      return NextResponse.json({ error: 'Ages array is required' }, { status: 400 });
    }

    const validAges = ages.filter(a => typeof a === 'number' && a > 0 && a < 120);
    if (validAges.length === 0) {
      return NextResponse.json({ error: 'At least one valid age is required' }, { status: 400 });
    }

    // Calculate FPL
    const fplAmount = FPL_BASE + (FPL_INCREMENT * (householdSize - 1));
    const fplPercent = Math.round((annualIncome / fplAmount) * 100);

    // Check Medicaid eligibility (138% FPL in expansion states)
    const medicaidLikely = fplPercent <= 138;

    // Calculate applicable percentage
    const applicablePercent = getApplicablePercentage(fplPercent);

    // Monthly contribution (what they pay toward benchmark plan)
    const monthlyContribution = Math.round((annualIncome * (applicablePercent / 100)) / 12);

    // SLCSP estimate
    const slcspEstimate = getSlcspEstimate(validAges);

    // Estimated subsidy
    const estimatedSubsidy = Math.max(0, slcspEstimate - monthlyContribution);

    // CSR eligibility
    const csrEligible = fplPercent >= 100 && fplPercent <= 250;
    let csrLevel = 'None';
    if (fplPercent <= 150) csrLevel = '94% AV';
    else if (fplPercent <= 200) csrLevel = '87% AV';
    else if (fplPercent <= 250) csrLevel = '73% AV';

    // Plan recommendation
    let planRecommendation = '';
    if (fplPercent <= 150) {
      planRecommendation = 'Silver plan with CSR - nearly $0 deductible';
    } else if (fplPercent <= 200) {
      planRecommendation = 'Silver plan with CSR - low deductible';
    } else if (fplPercent <= 250) {
      planRecommendation = 'Silver plan with CSR - reduced cost sharing';
    } else if (fplPercent <= 300) {
      planRecommendation = 'Silver or Gold plan';
    } else if (fplPercent <= 400) {
      planRecommendation = 'Bronze or Silver plan';
    } else {
      planRecommendation = 'Bronze plan - lowest premium';
    }

    // Net premium range estimate
    const netPremiumRange = {
      min: Math.max(0, Math.round(slcspEstimate * 0.6) - estimatedSubsidy), // Bronze
      max: Math.max(0, Math.round(slcspEstimate * 1.2) - estimatedSubsidy), // Gold
    };

    // Generate human-readable summary for AI
    const summary = medicaidLikely
      ? `At ${fplPercent}% of the Federal Poverty Level, this person may qualify for Medicaid. If not eligible for Medicaid, they would receive approximately $${estimatedSubsidy}/month in subsidies, making their net premium around $${netPremiumRange.min}-$${netPremiumRange.max}/month.`
      : `Based on ${fplPercent}% FPL, estimated monthly subsidy is $${estimatedSubsidy}. Net premium after subsidy would be approximately $${netPremiumRange.min}-$${netPremiumRange.max}/month. ${csrEligible ? `Eligible for Cost Sharing Reductions (${csrLevel}) on Silver plans.` : ''} Recommendation: ${planRecommendation}.`;

    return NextResponse.json({
      success: true,
      quote: {
        fplPercent,
        fplAmount,
        monthlyContribution,
        estimatedSubsidy,
        slcspEstimate,
        csrEligible,
        csrLevel,
        medicaidLikely,
        planRecommendation,
        netPremiumRange,
      },
      summary,
    });
  } catch (error) {
    console.error('Quote calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate quote' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/quote/subsidy
 * Quick subsidy estimate with query params
 *
 * Query: ?income=50000&household=2&ages=35,32
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const income = parseInt(searchParams.get('income') || '0');
    const household = parseInt(searchParams.get('household') || '1');
    const agesStr = searchParams.get('ages') || '';
    const ages = agesStr.split(',').map(a => parseInt(a.trim())).filter(a => !isNaN(a) && a > 0);

    if (!income || !ages.length) {
      return NextResponse.json({
        error: 'Required params: income, ages (comma-separated)',
        example: '/api/quote/subsidy?income=50000&household=2&ages=35,32'
      }, { status: 400 });
    }

    // Calculate FPL
    const fplAmount = FPL_BASE + (FPL_INCREMENT * (household - 1));
    const fplPercent = Math.round((income / fplAmount) * 100);

    // Calculate subsidy
    const applicablePercent = getApplicablePercentage(fplPercent);
    const monthlyContribution = Math.round((income * (applicablePercent / 100)) / 12);
    const slcspEstimate = getSlcspEstimate(ages);
    const estimatedSubsidy = Math.max(0, slcspEstimate - monthlyContribution);

    // Net premium
    const netPremiumMin = Math.max(0, Math.round(slcspEstimate * 0.6) - estimatedSubsidy);
    const netPremiumMax = Math.max(0, Math.round(slcspEstimate * 1.2) - estimatedSubsidy);

    return NextResponse.json({
      fplPercent,
      estimatedSubsidy,
      netPremiumRange: `$${netPremiumMin}-$${netPremiumMax}/mo`,
      medicaidLikely: fplPercent <= 138,
      csrEligible: fplPercent >= 100 && fplPercent <= 250,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to calculate' }, { status: 500 });
  }
}

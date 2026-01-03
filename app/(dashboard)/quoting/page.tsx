'use client';

import { useState } from 'react';
import { Calculator, DollarSign, Users, MapPin, Plus, Minus, Trash2, FileText, Sparkles, Info, CheckCircle, AlertTriangle } from 'lucide-react';

// 2024 Federal Poverty Level Guidelines (Continental US)
const FPL_BASE = 15060; // 1 person
const FPL_INCREMENT = 5380; // Each additional person

// 2024 ACA Applicable Percentages (with ARP extension through 2025)
const getApplicablePercentage = (fplPercent: number): { min: number; max: number } => {
  if (fplPercent <= 150) return { min: 0, max: 0 };
  if (fplPercent <= 200) return { min: 0, max: 2.0 };
  if (fplPercent <= 250) return { min: 2.0, max: 4.0 };
  if (fplPercent <= 300) return { min: 4.0, max: 6.0 };
  if (fplPercent <= 400) return { min: 6.0, max: 8.5 };
  return { min: 8.5, max: 8.5 }; // Above 400% FPL (still eligible under ARP)
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

interface HouseholdMember {
  id: number;
  age: string;
  tobacco: boolean;
}

interface QuoteResult {
  fplAmount: number;
  fplPercent: number;
  monthlyContribution: number;
  estimatedSubsidy: number;
  slcspEstimate: number;
  csrEligible: boolean;
  csrLevel: string;
  medicaidLikely: boolean;
  planRecommendation: string;
  netPremiumRange: { min: number; max: number };
}

export default function QuotingPage() {
  const [zipCode, setZipCode] = useState('');
  const [householdSize, setHouseholdSize] = useState(1);
  const [annualIncome, setAnnualIncome] = useState('');
  const [members, setMembers] = useState<HouseholdMember[]>([
    { id: 1, age: '', tobacco: false }
  ]);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  const addMember = () => {
    const newId = members.length > 0 ? Math.max(...members.map(m => m.id)) + 1 : 1;
    setMembers([...members, { id: newId, age: '', tobacco: false }]);
  };

  const removeMember = (id: number) => {
    if (members.length > 1) {
      setMembers(members.filter(m => m.id !== id));
    }
  };

  const updateMember = (id: number, field: keyof HouseholdMember, value: string | boolean) => {
    setMembers(members.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const calculateQuote = () => {
    setCalculating(true);

    // Validate inputs
    const income = parseFloat(annualIncome.replace(/,/g, ''));
    const ages = members.map(m => parseInt(m.age)).filter(a => !isNaN(a) && a > 0);

    if (isNaN(income) || income <= 0) {
      alert('Please enter a valid annual income');
      setCalculating(false);
      return;
    }

    if (ages.length === 0) {
      alert('Please enter at least one valid age');
      setCalculating(false);
      return;
    }

    // Calculate FPL
    const fplAmount = FPL_BASE + (FPL_INCREMENT * (householdSize - 1));
    const fplPercent = Math.round((income / fplAmount) * 100);

    // Check Medicaid eligibility (138% FPL in expansion states)
    const medicaidLikely = fplPercent <= 138;

    // Calculate applicable percentage
    const { max: applicablePercent } = getApplicablePercentage(fplPercent);

    // Monthly contribution (what they pay toward benchmark plan)
    const monthlyContribution = Math.round((income * (applicablePercent / 100)) / 12);

    // SLCSP estimate
    const slcspEstimate = getSlcspEstimate(ages);

    // Estimated subsidy
    const estimatedSubsidy = Math.max(0, slcspEstimate - monthlyContribution);

    // CSR eligibility
    const csrEligible = fplPercent >= 100 && fplPercent <= 250;
    let csrLevel = 'None';
    if (fplPercent <= 150) csrLevel = '94% AV (Best)';
    else if (fplPercent <= 200) csrLevel = '87% AV (Great)';
    else if (fplPercent <= 250) csrLevel = '73% AV (Good)';

    // Plan recommendation
    let planRecommendation = '';
    if (fplPercent <= 150) {
      planRecommendation = 'Silver plan with CSR - Best value, nearly $0 deductible';
    } else if (fplPercent <= 200) {
      planRecommendation = 'Silver plan with CSR - Low deductible, great coverage';
    } else if (fplPercent <= 250) {
      planRecommendation = 'Silver plan with CSR - Reduced cost sharing';
    } else if (fplPercent <= 300) {
      planRecommendation = 'Silver or Gold plan - Good balance of premium and coverage';
    } else if (fplPercent <= 400) {
      planRecommendation = 'Bronze or Silver plan - Lower premiums, HSA eligible options';
    } else {
      planRecommendation = 'Bronze plan - Lowest premium, good for healthy individuals';
    }

    // Net premium range estimate
    const netPremiumRange = {
      min: Math.max(0, Math.round(slcspEstimate * 0.6) - estimatedSubsidy), // Bronze
      max: Math.max(0, Math.round(slcspEstimate * 1.2) - estimatedSubsidy), // Gold
    };

    setResult({
      fplAmount,
      fplPercent,
      monthlyContribution,
      estimatedSubsidy,
      slcspEstimate,
      csrEligible,
      csrLevel,
      medicaidLikely,
      planRecommendation,
      netPremiumRange,
    });

    setCalculating(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  };

  const resetForm = () => {
    setZipCode('');
    setHouseholdSize(1);
    setAnnualIncome('');
    setMembers([{ id: 1, age: '', tobacco: false }]);
    setResult(null);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gradient-to-br from-sky-500 to-teal-500 rounded-xl">
            <Calculator className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Health Insurance Quote Calculator</h1>
        </div>
        <p className="text-slate-600 dark:text-slate-400">
          Calculate ACA subsidies and estimate monthly premiums for private and marketplace plans.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-500" />
            Client Information
          </h2>

          {/* Zip Code */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <MapPin className="w-4 h-4 inline mr-1" />
              Zip Code
            </label>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="75001"
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
          </div>

          {/* Household Size */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <Users className="w-4 h-4 inline mr-1" />
              Household Size (for tax purposes)
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setHouseholdSize(Math.max(1, householdSize - 1))}
                className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
              >
                <Minus className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </button>
              <span className="text-xl font-semibold text-slate-900 dark:text-white w-12 text-center">
                {householdSize}
              </span>
              <button
                onClick={() => setHouseholdSize(Math.min(10, householdSize + 1))}
                className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          </div>

          {/* Annual Income */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <DollarSign className="w-4 h-4 inline mr-1" />
              Expected Annual Household Income
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input
                type="text"
                value={annualIncome}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^\d]/g, '');
                  setAnnualIncome(val ? parseInt(val).toLocaleString() : '');
                }}
                placeholder="50,000"
                className="w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Household Members */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              People Needing Coverage
            </label>
            <div className="space-y-3">
              {members.map((member, index) => (
                <div key={member.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-20">
                    {index === 0 ? 'Primary' : `Member ${index + 1}`}
                  </span>
                  <input
                    type="number"
                    value={member.age}
                    onChange={(e) => updateMember(member.id, 'age', e.target.value)}
                    placeholder="Age"
                    min="0"
                    max="120"
                    className="w-20 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white text-center focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={member.tobacco}
                      onChange={(e) => updateMember(member.id, 'tobacco', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">Tobacco</span>
                  </label>
                  {members.length > 1 && (
                    <button
                      onClick={() => removeMember(member.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addMember}
              className="mt-3 flex items-center gap-2 text-sm text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Another Person
            </button>
          </div>

          {/* Calculate Button */}
          <div className="flex gap-3">
            <button
              onClick={calculateQuote}
              disabled={calculating}
              className="flex-1 py-3 bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-600 hover:to-teal-600 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-5 h-5" />
              {calculating ? 'Calculating...' : 'Calculate Subsidy'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-teal-500" />
            Quote Results
          </h2>

          {!result ? (
            <div className="text-center py-12 text-slate-400">
              <Calculator className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p>Enter client information and click Calculate to see results</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Medicaid Warning */}
              {result.medicaidLikely && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-300">Medicaid Likely Eligible</p>
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        At {result.fplPercent}% FPL, this client may qualify for Medicaid in expansion states. Check state eligibility first.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* FPL Info */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Federal Poverty Level</span>
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">{result.fplPercent}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      result.fplPercent <= 150 ? 'bg-green-500' :
                      result.fplPercent <= 250 ? 'bg-teal-500' :
                      result.fplPercent <= 400 ? 'bg-sky-500' : 'bg-slate-500'
                    }`}
                    style={{ width: `${Math.min(100, result.fplPercent / 4)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  FPL for household: {formatCurrency(result.fplAmount)}/year
                </p>
              </div>

              {/* Subsidy Estimate */}
              <div className="p-4 bg-gradient-to-br from-teal-50 to-sky-50 dark:from-teal-900/20 dark:to-sky-900/20 border border-teal-200 dark:border-teal-800 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  <span className="text-sm font-medium text-teal-800 dark:text-teal-300">Estimated Monthly Subsidy</span>
                </div>
                <p className="text-3xl font-bold text-teal-700 dark:text-teal-300">
                  {formatCurrency(result.estimatedSubsidy)}<span className="text-lg font-normal">/mo</span>
                </p>
                <p className="text-sm text-teal-600 dark:text-teal-400 mt-1">
                  Based on {formatCurrency(result.slcspEstimate)}/mo benchmark plan
                </p>
              </div>

              {/* CSR Eligibility */}
              {result.csrEligible && (
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-medium text-purple-800 dark:text-purple-300">Cost Sharing Reduction Eligible</span>
                  </div>
                  <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{result.csrLevel}</p>
                  <p className="text-sm text-purple-600 dark:text-purple-400">
                    Silver plans will have reduced deductibles & copays
                  </p>
                </div>
              )}

              {/* Net Premium Range */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Estimated Net Premium After Subsidy</span>
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatCurrency(result.netPremiumRange.min)} - {formatCurrency(result.netPremiumRange.max)}<span className="text-sm font-normal text-slate-500">/mo</span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Range from Bronze to Gold plans
                </p>
              </div>

              {/* Recommendation */}
              <div className="p-4 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  <span className="text-sm font-medium text-sky-800 dark:text-sky-300">Recommendation</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300">{result.planRecommendation}</p>
              </div>

              {/* Disclaimer */}
              <div className="flex items-start gap-2 p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This is an estimate only. Actual subsidies depend on the Second Lowest Cost Silver Plan (SLCSP) in your area,
                  final income, and enrollment details. Verify with healthcare.gov for exact amounts.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

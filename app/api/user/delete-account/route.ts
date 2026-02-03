import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Create service role client for database operations
    const adminClient = createServiceRoleClient();

    // Delete all user data using service role client (bypasses RLS)
    // Delete in order respecting foreign key constraints

    // 0. Release phone numbers back to pool and from Telnyx
    const { data: userNumbers } = await adminClient
      .from('user_telnyx_numbers')
      .select('phone_number')
      .eq('user_id', userId);

    if (userNumbers && userNumbers.length > 0) {
      const apiKey = process.env.TELNYX_API_KEY;

      for (const num of userNumbers) {
        // Release from Telnyx API
        if (apiKey) {
          try {
            const listRes = await fetch(
              `https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(num.phone_number)}`,
              { headers: { 'Authorization': `Bearer ${apiKey}` } }
            );
            const listData = await listRes.json();
            const telnyxId = listData.data?.[0]?.id;
            if (telnyxId) {
              await fetch(`https://api.telnyx.com/v2/phone_numbers/${telnyxId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${apiKey}` },
              });
            }
          } catch (e) {
            console.error('Error releasing number from Telnyx:', num.phone_number, e);
          }
        }

        // Mark pool numbers as available again
        await adminClient
          .from('number_pool')
          .update({ is_assigned: false, assigned_to_user_id: null, assigned_at: null })
          .eq('phone_number', num.phone_number);
      }

      // Delete from user_telnyx_numbers
      await adminClient
        .from('user_telnyx_numbers')
        .delete()
        .eq('user_id', userId);
    }

    // 1. Delete points transactions
    await adminClient
      .from('points_transactions')
      .delete()
      .eq('user_id', userId);

    // 2. Delete messages
    await adminClient
      .from('messages')
      .delete()
      .eq('user_id', userId);

    // 3. Delete leads
    await adminClient
      .from('leads')
      .delete()
      .eq('user_id', userId);

    // 4. Delete campaigns
    await adminClient
      .from('campaigns')
      .delete()
      .eq('user_id', userId);

    // 5. Delete tags
    await adminClient
      .from('tags')
      .delete()
      .eq('user_id', userId);

    // 6. Delete flows (if exists)
    await adminClient
      .from('flows')
      .delete()
      .eq('user_id', userId);

    // 7. Delete user profile data
    const { error: userError } = await adminClient
      .from('users')
      .delete()
      .eq('id', userId);

    if (userError) {
      console.error('Error deleting user profile:', userError);
    }

    // 8. Delete auth user (using service role client for admin operations)
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error('Error deleting auth user:', deleteAuthError);
      // Even if auth deletion fails, user data is deleted
    }

    // Sign out the user
    await supabase.auth.signOut();

    return NextResponse.json(
      {
        success: true,
        message: "Account successfully deleted"
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete account" },
      { status: 500 }
    );
  }
}

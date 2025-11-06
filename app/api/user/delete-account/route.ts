import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Delete all user data in order (respecting foreign key constraints)

    // 1. Delete points transactions
    const { error: transactionsError } = await supabase
      .from('points_transactions')
      .delete()
      .eq('user_id', userId);

    if (transactionsError) {
      console.error('Error deleting transactions:', transactionsError);
    }

    // 2. Delete messages
    const { error: messagesError } = await supabase
      .from('messages')
      .delete()
      .eq('user_id', userId);

    if (messagesError) {
      console.error('Error deleting messages:', messagesError);
    }

    // 3. Delete threads
    const { error: threadsError } = await supabase
      .from('threads')
      .delete()
      .eq('user_id', userId);

    if (threadsError) {
      console.error('Error deleting threads:', threadsError);
    }

    // 4. Delete leads
    const { error: leadsError } = await supabase
      .from('leads')
      .delete()
      .eq('user_id', userId);

    if (leadsError) {
      console.error('Error deleting leads:', leadsError);
    }

    // 5. Delete campaigns
    const { error: campaignsError } = await supabase
      .from('campaigns')
      .delete()
      .eq('user_id', userId);

    if (campaignsError) {
      console.error('Error deleting campaigns:', campaignsError);
    }

    // 6. Delete tags
    const { error: tagsError } = await supabase
      .from('tags')
      .delete()
      .eq('user_id', userId);

    if (tagsError) {
      console.error('Error deleting tags:', tagsError);
    }

    // 7. Delete templates (if exists)
    const { error: templatesError } = await supabase
      .from('templates')
      .delete()
      .eq('user_id', userId);

    if (templatesError) {
      console.error('Error deleting templates:', templatesError);
    }

    // 8. Delete flows (if exists)
    const { error: flowsError } = await supabase
      .from('flows')
      .delete()
      .eq('user_id', userId);

    if (flowsError) {
      console.error('Error deleting flows:', flowsError);
    }

    // 9. Delete user profile data
    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (userError) {
      console.error('Error deleting user profile:', userError);
      return NextResponse.json(
        { error: "Failed to delete user profile data" },
        { status: 500 }
      );
    }

    // 10. Delete auth user (this will cascade delete related auth data)
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error('Error deleting auth user:', deleteAuthError);
      // Note: This requires service role key. If it fails, user data is deleted but auth remains
      // You may need to use a service role client for this
      return NextResponse.json(
        {
          success: true,
          message: "User data deleted. Please contact support to complete account deletion.",
          partial: true
        },
        { status: 200 }
      );
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

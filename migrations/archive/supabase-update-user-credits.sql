-- Update user creation trigger to start with 0 credits
-- Run this in your Supabase SQL Editor

-- First, drop the existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create function to handle new user creation with 0 credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, credits, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    0, -- Start with 0 credits until they subscribe
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to call function when new auth user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update any existing users who might have credits to 0 (optional - only if you want to reset existing users)
-- UPDATE public.users SET credits = 0 WHERE subscription_status IS NULL OR subscription_status = 'none';

COMMENT ON FUNCTION public.handle_new_user() IS 'Creates a user record with 0 credits when a new auth user signs up';

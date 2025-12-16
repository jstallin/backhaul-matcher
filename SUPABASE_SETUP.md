# Supabase Integration Setup Guide

## Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project"
3. Sign in with GitHub (or create account)
4. Click "New Project"
5. Fill in details:
   - **Project name**: `backhaul-production` (or whatever you want)
   - **Database password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users (US East for Eastern US)
   - **Pricing plan**: Free tier is perfect to start
6. Click "Create new project" (takes ~2 minutes)

## Step 2: Set Up Database Schema

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click "New Query"
3. Copy the entire contents of `supabase-schema.sql`
4. Paste into the SQL editor
5. Click "Run" (bottom right)
6. You should see success messages for all tables

## Step 3: Get API Credentials

1. In Supabase, go to **Settings** > **API** (left sidebar)
2. Copy these two values:
   - **Project URL** (something like `https://abc...xyz.supabase.co`)
   - **anon/public key** (long string starting with `eyJ...`)

## Step 4: Configure Your App

1. In your `backhaul-matcher` folder, create a `.env` file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. Save the file

## Step 5: Test Locally

```bash
npm run dev
```

Navigate to `http://localhost:5173` and you should see:
- Login/Sign up screen
- No errors in the console

## Step 6: Create Your First Account

1. Click "Sign Up"
2. Enter your details:
   - Full Name
   - Email
   - Role: Fleet Manager
   - Password (at least 6 characters)
3. Click "Create Account"
4. Check your email for confirmation link
5. Click the link to verify
6. Go back to the app and sign in

## Step 7: Configure Email (Optional but Recommended)

By default, Supabase uses their email service with rate limits. For production, set up a custom SMTP:

1. Go to **Authentication** > **Email Templates** in Supabase
2. Click **Settings** > **Auth Providers** > **Email**
3. Add your SMTP settings (Gmail, SendGrid, etc.)

For now, the default works fine for testing!

## Step 8: Deploy to Vercel with Environment Variables

1. In your Vercel project dashboard, go to **Settings** > **Environment Variables**
2. Add both variables:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
3. Redeploy: `vercel --prod`

## Database Structure

Your database now has these tables:

### Core Tables
- **fleets** - Fleet companies (linked to user accounts)
- **trucks** - Individual trucks in each fleet
- **drivers** - Drivers assigned to fleets/trucks
- **fleet_profiles** - Extended settings (search radius, relay mode, etc.)

### Feature Tables
- **search_history** - Track all searches for analytics
- **saved_opportunities** - Bookmarked loads from searches
- **user_profiles** - Extended user information

### Security
- **Row Level Security (RLS)** is enabled on ALL tables
- Users can only access their own data
- Drivers can only see their assigned fleet
- All enforced at the database level

## Next Steps

### 1. Create Your First Fleet

After signing in, you'll need to add fleet creation UI. For now, you can add manually in Supabase:

1. Go to **Table Editor** > **fleets**
2. Click "Insert row"
3. Fill in:
   - **user_id**: Your user ID (from auth.users table)
   - **name**: "My Fleet Company"
   - **mc_number**: "MC-123456"
   - **home_address**: "Davidson, NC"
   - **home_lat**: 35.4993
   - **home_lng**: -80.8481
4. Click "Save"

### 2. Add Trucks

1. Go to **Table Editor** > **trucks**
2. Insert trucks with your fleet_id

### 3. Build Fleet Management UI

Next development steps:
- Fleet creation/edit forms
- Truck management interface
- Driver assignment
- Profile settings page
- Integration with search functionality

## Troubleshooting

### "Missing Supabase environment variables"
- Make sure `.env` file exists in project root
- Restart dev server after creating `.env`
- Check variable names match exactly: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### "Invalid JWT" or Auth errors
- Double-check you copied the anon key correctly (it's very long!)
- Make sure no extra spaces or line breaks

### Can't sign in after creating account
- Check your email for confirmation link
- If email didn't arrive, check spam folder
- You can disable email confirmation in Supabase: **Authentication** > **Providers** > **Email** > uncheck "Confirm email"

### Database errors
- Make sure you ran the entire `supabase-schema.sql` file
- Check the SQL Editor for error messages
- Try running each section separately if needed

## Security Notes

✅ **Safe to expose in client-side code:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These are designed to be public. Security is handled by:
- Row Level Security (RLS) policies in database
- JWT tokens from auth
- All data access is validated server-side

❌ **Never expose:**
- Database password
- `service_role` key (if you see one, don't use it!)

## Database Backups

Supabase automatically backs up your database daily on the free tier. For production:
- Enable Point-in-Time Recovery (paid plans)
- Export your schema regularly
- Consider periodic manual backups

## Monitoring

Monitor your usage in Supabase dashboard:
- **Database** > Shows table sizes, connections
- **Auth** > Shows user signups, active users
- **API** > Shows request counts

Free tier limits:
- 500MB database
- 2GB bandwidth
- 50,000 monthly active users
- Unlimited API requests

## Getting Help

- [Supabase Docs](https://supabase.com/docs)
- [Discord Community](https://discord.supabase.com)
- Check the console for error messages
- Supabase provides detailed error messages

---

**You're all set!** 🎉

Your BackHaul app now has:
- ✅ User authentication (email/password)
- ✅ Secure database with RLS
- ✅ Fleet, truck, and driver management schema
- ✅ Search history tracking
- ✅ Production-ready infrastructure

Next: Build the fleet management UI and integrate with your backhaul search algorithm!

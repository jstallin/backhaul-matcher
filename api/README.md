# Notification API Setup Guide

This guide will help you set up email and SMS notifications for Haul Monitor.

## 📦 Files Created

```
/api/notifications/
  ├── send-email.js    # Resend email endpoint
  └── send-sms.js      # Twilio SMS endpoint
```

## 🔧 Environment Variables Needed

### In Vercel Dashboard (Settings → Environment Variables):

Add these environment variables:

```
RESEND_API_KEY=re_your_api_key_here
TWILIO_ACCOUNT_SID=ACyour_sid_here
TWILIO_AUTH_TOKEN=your_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

### In Local .env File:

```bash
# Same variables for local development
RESEND_API_KEY=re_your_api_key_here
TWILIO_ACCOUNT_SID=ACyour_sid_here
TWILIO_AUTH_TOKEN=your_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

## 📧 Resend Setup (Email)

1. **Sign up**: https://resend.com/signup
2. **Verify Domain**: 
   - Go to "Domains" in Resend dashboard
   - Add your domain (e.g., haulmonitor.com)
   - Add DNS records they provide
3. **Get API Key**:
   - Go to "API Keys"
   - Create new key
   - Copy the key starting with `re_...`
4. **Update Email Sender**:
   - Edit `/api/notifications/send-email.js`
   - Change line 23: `from: 'Haul Monitor <notifications@yourdomain.com>'`

## 📱 Twilio Setup (SMS)

1. **Sign up**: https://www.twilio.com/try-twilio
2. **Get Account Info**:
   - Go to Console: https://console.twilio.com/
   - Copy "Account SID" (starts with AC...)
   - Copy "Auth Token" (click to reveal)
3. **Buy Phone Number**:
   - Go to "Phone Numbers" → "Buy a Number"
   - Search for US number
   - Buy number (~$1/month)
   - Copy the phone number (format: +15551234567)

## 🚀 Deployment Steps

### 1. Install Dependencies

```bash
npm install resend twilio
```

### 2. Add Environment Variables to Vercel

Go to: https://vercel.com/your-project/settings/environment-variables

Add each variable:
- Name: `RESEND_API_KEY`
- Value: `re_your_actual_key`
- Environment: Production, Preview, Development

Repeat for all 4 variables.

### 3. Deploy

```bash
git add .
git commit -m "Add notification API endpoints"
git push origin main
```

Vercel will automatically redeploy.

### 4. Test API Endpoints

After deployment, test the endpoints:

**Test Email:**
```bash
curl -X POST https://your-domain.vercel.app/api/notifications/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your@email.com",
    "subject": "Test Email",
    "text": "This is a test email from Haul Monitor",
    "html": "<h1>Test Email</h1><p>This is a test email from Haul Monitor</p>"
  }'
```

**Test SMS:**
```bash
curl -X POST https://your-domain.vercel.app/api/notifications/send-sms \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15551234567",
    "message": "Test SMS from Haul Monitor"
  }'
```

## 💰 Pricing

### Resend (Email)
- Free tier: 3,000 emails/month
- Paid: $20/month for 50,000 emails

### Twilio (SMS)
- Phone number: ~$1.00/month
- Outbound SMS: ~$0.0075 per message (US)
- Example: 100 notifications/month = $1.75/month total

## 🐛 Troubleshooting

### "Email not configured" Error
- Check RESEND_API_KEY is set in Vercel
- Verify domain in Resend dashboard
- Check DNS records are properly configured

### "SMS service not configured" Error
- Check all TWILIO_* variables are set in Vercel
- Verify phone number format: +15551234567 (include country code)
- Make sure phone number is active in Twilio console

### CORS Errors
- API endpoints have CORS headers enabled
- If issues persist, check browser console for specific error

### 404 on API Routes
- Verify files are in `/api/notifications/` directory
- Check vercel.json has functions configuration
- Redeploy after adding files

## 📝 Testing Notifications

To test the full flow:

1. Create a request with notifications enabled
2. Enable auto-refresh (30 min)
3. Wait for auto-refresh to run
4. Check console logs for "📬 Material change detected"
5. Check your email/phone for notification

## 🔍 Monitoring

Check Vercel deployment logs:
1. Go to Vercel dashboard
2. Click on deployment
3. Go to "Functions" tab
4. Click on `/api/notifications/send-email` or `/api/notifications/send-sms`
5. View logs to see successes/errors

## ✅ Verification Checklist

- [ ] Resend account created
- [ ] Domain verified in Resend
- [ ] Resend API key added to Vercel
- [ ] Twilio account created
- [ ] Phone number purchased in Twilio
- [ ] Twilio credentials added to Vercel
- [ ] Dependencies installed (`npm install`)
- [ ] Code deployed to Vercel
- [ ] Email endpoint tested
- [ ] SMS endpoint tested
- [ ] Notification received successfully

## 🆘 Need Help?

Check Vercel function logs for detailed error messages:
`https://vercel.com/your-project/deployments`

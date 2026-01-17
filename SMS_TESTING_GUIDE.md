# SMS Notification Testing Guide

## ✅ Easiest Option: Email-to-SMS Gateway (FREE)

### **How It Works:**
Instead of using Twilio, send SMS via email using carrier gateways. All US carriers have email-to-SMS addresses that convert emails to text messages.

### **Setup (2 minutes):**

1. **Find Your Carrier:**
   - Verizon, AT&T, T-Mobile, Sprint, etc.

2. **Add to .env:**
   ```bash
   VITE_USE_EMAIL_TO_SMS=true
   VITE_SMS_CARRIER=verizon
   ```

3. **Carrier Options:**
   ```
   verizon   → @vtext.com
   att       → @txt.att.net
   tmobile   → @tmomail.net
   sprint    → @messaging.sprintpcs.com
   boost     → @sms.myboostmobile.com
   cricket   → @sms.cricketwireless.net
   uscellular → @email.uscc.net
   ```

4. **Deploy:**
   ```bash
   git add .
   git commit -m "Use email-to-SMS for testing"
   git push
   ```

### **How It Works:**
```
Fleet phone: +1234567890
Carrier: Verizon
→ Converts to: 1234567890@vtext.com
→ Sends email via Resend
→ You receive as text message!
```

### **Advantages:**
- ✅ **FREE** - Uses your existing email service
- ✅ **No signup** - No Twilio account needed
- ✅ **Instant** - Works immediately
- ✅ **No verification** - No hoops to jump through

### **Limitations:**
- Message may show as coming from email address
- 160 character limit per message
- May have slight delay (usually under 1 minute)

### **Testing:**

Set your fleet phone number to: `+1234567890`
Set notification method to: `Text` or `Both`

When auto-refresh detects changes:
```
📧 Email sent to: 1234567890@vtext.com
📱 You receive as SMS: "New top backhaul for Alachua Run: $125.00..."
```

---

## 🔧 Alternative: Twilio (Production Ready)

Only use this when you're ready for production and need to send to any phone number.

### **Requirements:**
- Twilio account verified
- Phone number purchased ($1/month)
- Business verification complete

### **Setup:**
```bash
VITE_USE_EMAIL_TO_SMS=false
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+15551234567
```

---

## 📝 Recommendation

**For Testing:** Use Email-to-SMS (Option 1)
**For Production:** Switch to Twilio when you need:
- To send to customers' phones (not just your own)
- Professional sender ID
- Delivery reports
- 2-way SMS

Start with email-to-SMS, switch to Twilio later! 🚀

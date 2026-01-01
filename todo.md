# Post-Deployment Checklist

- [ ] **Set Webhook**: User needs to call the Telegram API to set the webhook to the new Railway URL.
- [ ] **Configure Environment Variables**: User needs to add `TELEGRAM_BOT_TOKEN` and `JWT_SECRET` in Railway Dashboard.
- [ ] **Verify Login**: Test phone number authentication on the live site.
- [ ] **Verify Real-time Chat**: Test sending and receiving messages on the live site.
- [ ] **Verify Bot Integration**: Test if the bot correctly forwards messages/notifications.

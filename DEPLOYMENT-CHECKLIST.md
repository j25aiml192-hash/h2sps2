# Deployment Checklist

## Setup Phase
- [ ] Created Firebase project
- [ ] Enabled Firestore database
- [ ] Set Firestore security rules
- [ ] Created Firestore indexes
- [ ] Downloaded service account JSON
- [ ] Got Groq API key
- [ ] Got Google AI (Gemini) key
- [ ] Got Cerebras API key
- [ ] Got Together AI key
- [ ] Got NVIDIA NIM key
- [ ] Created .env.local with all keys
- [ ] Created .env.example (no secrets)
- [ ] Added .gitignore
- [ ] Installed all dependencies

## Code Phase
- [ ] All TypeScript files compile
- [ ] No ESLint errors
- [ ] All tests passing
- [ ] Build succeeds locally
- [ ] Tested debate flow locally
- [ ] Tested voice input/output
- [ ] Tested news API (if enabled)

## Deployment Phase
- [ ] Installed Vercel CLI
- [ ] Logged into Vercel
- [ ] Deployed to preview
- [ ] Added all env vars to Vercel
- [ ] Deployed to production
- [ ] Verified cron job is active
- [ ] Tested production URL
- [ ] Checked all API endpoints work
- [ ] Verified Firebase connection

## Monitoring Phase
- [ ] Enabled Vercel Analytics
- [ ] Checked Firebase usage
- [ ] Set up error monitoring (optional)
- [ ] Monitored first 24hrs for errors

## Submission Phase
- [ ] Updated README with live URL
- [ ] Recorded demo video (2-3 mins)
- [ ] Took screenshots
- [ ] Prepared GitHub repo (public)
- [ ] Wrote submission description
- [ ] Submitted to Hack2Skills portal

## Post-Submission
- [ ] Monitor error rates
- [ ] Check rate limit usage
- [ ] Gather user feedback
- [ ] Plan improvements

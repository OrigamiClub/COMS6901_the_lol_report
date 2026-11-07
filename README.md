This application shows statistics for humor studies:

Staging: https://stats.slightlyhumorous.org
Production: https://stats.humorstudy.org

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on AWS

This app is deployed with AWS Amplify Hosting through a console-managed GitHub
App connection. Amplify uses the committed `amplify.yml` build spec.

Applications:

- Staging: `the-lol-report-staging`, connected to the `staging` branch and
  served from `https://stats.slightlyhumorous.org`
- Production: `the-lol-report-production`, connected to the `main` branch and
  served from `https://stats.humorstudy.org`

One-time setup:

1. Install the Amplify GitHub App for `us-east-1` and grant it access to
   `The-Humor-Project/the-lol-report`:
   `https://github.com/apps/aws-amplify-us-east-1/installations/new`
2. In the AWS Amplify console, choose **New app** -> **Host web app**.
3. Choose **GitHub** and select `The-Humor-Project/the-lol-report`.
4. Create the staging app with app name `the-lol-report-staging` and branch
   `staging`.
5. Create the production app with app name `the-lol-report-production` and
   branch `main`.
6. Confirm Amplify uses the committed root `amplify.yml` build spec.
7. Add the custom domains in the Amplify console:
   - `stats.slightlyhumorous.org` -> staging branch
   - `stats.humorstudy.org` -> production branch

Required Amplify environment variables:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Optional:

- `NEXT_PUBLIC_API_BASE_URL`
- `GOOGLE_GENERATIVE_AI_API_KEY` (server-only): enables AI meme tagging on `/tagging`.
- `MEME_TAGGING_MODEL` (server-only): Gemini model for tagging; defaults to `gemini-3.8-flash`.

Amplify must rebuild after environment values change. The root `amplify.yml`
writes all `NEXT_PUBLIC_*` Amplify environment variables (plus the optional
server-only `GOOGLE_GENERATIVE_AI_API_KEY` and `MEME_TAGGING_MODEL`) into `.env.production`
before `next build` so they are available to the Next.js SSR runtime. The build
fails early if the required site/auth variables are missing from the selected
Amplify app or branch. The OAuth callback route uses `NEXT_PUBLIC_SITE_URL` for
its final post-login redirect so Amplify internal host headers cannot send users
to `localhost`.

Add these redirect URLs in Google OAuth and Supabase auth settings:

- `https://stats.slightlyhumorous.org/auth/callback`
- `https://stats.humorstudy.org/auth/callback`

In Supabase Auth URL Configuration, set the Site URL to the canonical production
origin, `https://stats.humorstudy.org`. Keep the local callback URL for
whichever dev port is used locally. This app does not use a Supabase
service-role key; all Supabase requests should use the logged-in user's JWT.

# English Reading Library (A2–B1)

## What is included
- `index.html`: responsive reading library and word lookup interface.
- `netlify/functions/library.mjs`: persistent content API backed by Netlify Blobs.
- `netlify.toml` and `package.json`: Netlify build configuration.

## Deploy to Netlify
1. Upload this project folder to a GitHub repository (recommended), or deploy it using Netlify's manual deploy workflow with the project files.
2. In Netlify, open **Site configuration → Environment variables**.
3. Add `ADMIN_PASSWORD` with a private password of your choice.
4. Trigger a deploy. Netlify will install `@netlify/blobs` and deploy the Function.
5. Open your Netlify site URL and click **＋ Thêm bài mới**. Enter the password when prompted.

## Important
- New articles are stored in Netlify Blobs, not in the HTML file. They remain available after future deploys to the same Netlify site.
- The initial sample articles are built into the page as a fallback. They are not automatically written into the database.
- Word lookup uses the public Free Dictionary API for IPA/English definitions and MyMemory for English–Vietnamese translation. These are third-party services and require an internet connection; availability and translation quality may vary.
- Pronunciation audio uses the browser's built-in English text-to-speech voice.
- This is a personal-use starter. The admin password is checked by the Function, but the browser asks for it each time you save. Do not share the password.
- For a production-grade dictionary that reliably provides contextual Vietnamese meanings, examples, saved vocabulary, and user accounts, connect a dedicated dictionary/translation provider or add a curated vocabulary layer.

## Updating articles
Use the website's **＋ Thêm bài mới** form. You do not need to edit `index.html` or redeploy for each article.

# Google Analytics deployment note

The production GitHub Pages site must include the Google tag in the HTML
`head` on every deploy.

The source of truth is `app/layout.tsx`. Keep the `G-XP7EET4WHR` gtag scripts
inside the root layout `head`; Next.js static export will copy them into
`out/index.html`, and `npm run deploy` publishes that output to `gh-pages`.

Before publishing, verify the exported page still contains the tag:

```sh
npm run export
grep -n "G-XP7EET4WHR" out/index.html
```

Do not patch only the generated `gh-pages` HTML without keeping the root layout
in sync, because the next deploy would overwrite it.

# Re:2048 Monetization Notes

## Recommended hosting

Use Netlify Free or another static host that allows commercial use. This app is plain HTML, CSS, and JavaScript, so no build command is required.

Netlify settings:

- Build command: leave empty
- Publish directory: `.`
- Custom domain: point the domain to the Netlify site before applying to ad networks

## Support link setup

Ko-fi is currently embedded with the official widget snippet in `index.html`.

## Supporter Auto mode

Auto mode is currently locked behind a supporter unlock code. Share this code with Ko-fi supporters through a Ko-fi supporter-only post, thank-you message, or manual reply:

```text
RE2048-AUTO-KOFI
```

The static-site implementation stores an unlocked flag in the player's browser. This is good enough for a lightweight supporter perk, but it is not strong access control because client-side code can be inspected.

For stronger verification later, replace the unlock code flow with:

- Ko-fi webhook
- Netlify Function
- server-side supporter/payment check
- short-lived unlock token returned to the browser

## Platform notes

- Ko-fi: Good for casual tips, memberships, and a lightweight creator page.

## AdSense setup, optional later

1. Deploy the site on a commercial-use-friendly host.
2. Apply for Google AdSense with the production domain.
3. Add AdSense only if you decide the extra revenue is worth the brand-safety review work.

## Privacy policy

`privacy.html` is included and linked from the game footer. Update the contact paragraph before launch if you want to show a specific email address or profile URL.

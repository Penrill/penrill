# Penrill UI

The desktop editor, standalone web editor, Cloud workspace and product site share this private React workspace. Import individual components by name, for example `@penrill/ui/dialog`. The web editor and Cloud workspace use the same renderer as the desktop app.

Import `@penrill/ui/styles.css` in entry points that use styled components. It provides Tailwind utilities without a global preflight reset and follows Penrill's theme.

The components originate from Catalyst UI Kit by Tailwind Labs and are subject to its [Tailwind Plus license](https://tailwindcss.com/plus/license). The complete original download, including both languages and demos, is kept locally in `vendor/catalyst-ui-kit`.

Only the components the app uses are kept here; add others from the local kit when needed.

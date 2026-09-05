# Profile maintenance

## Language selection

Edit `excludedLanguages` in [profile-config.json](profile-config.json) to hide a language from the profile card. Names follow the GitHub repository languages API; matching is case-insensitive. The default list excludes JavaScript, TypeScript, frontend component languages, and web styling/markup languages.

Each run discovers all public repositories owned by the account, including later pages and newly created repositories. Forks, archived repositories, private repositories, and the profile repository itself are excluded. These repository rules also apply to the overview; language exclusions only affect the language card.

Excluded language bytes are removed before ranking and percentage calculation. If the remaining languages exceed `maxLanguages` (2–6), the final slot combines the remainder into `Other`. Excluded languages never enter `Other`. An all-excluded result produces an empty-state card while the overview continues to update.

The data describes repository file bytes, not personal proficiency or authorship of every line. This configuration changes the profile card; it does not change GitHub Linguist labels on individual repositories.

## Generate and check

```sh
node --test .github/scripts/generate-language-card.test.mjs
GITHUB_TOKEN="$(gh auth token)" node .github/scripts/generate-language-card.mjs
```

The generated SVGs are written to `dist/`, which is ignored by Git. The existing workflow runs the tests, generates the activity cards and snake, and publishes the assets to the `output` branch on pushes to `master`, daily, or by manual dispatch. README references those published URLs; local generation alone does not update the live profile.

## Featured projects

Featured Projects uses four text cards with linked project names, short descriptions, and native code-style tags. It contains no images and uses GitHub's own light/dark styling.

Generated artwork experiments and their prompts are kept locally in `assets/project-artwork/`. This entire directory is ignored by Git and is not required to render the README. The earlier tracked SVG covers remain in `assets/projects/` as unused assets.

## Activity layout

Activity cards share a 420 × 210 canvas and display at up to 390px wide. They sit side by side when space permits and wrap onto separate lines on narrow screens. Their `<picture>` elements switch between the light and dark SVGs.

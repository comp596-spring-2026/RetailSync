# Brand components

Use these components so logos and the loader stay consistent. Asset paths are set in `assets.ts`.

| Component | Use for |
|-----------|--------|
| **LogoHorizontal** | Header / navbar (icon + wordmark side by side) |
| **LogoBig** | Auth and marketing (full logo, large) |
| **LogoStacked** | Icon above “RetailSync” wordmark (stacked layout) |
| **Icon** | Standalone mark (e.g. favicon, small badge). Use `useSvg` for crisp scaling. |
| **IconLoader** | Loading states: rotating icon + circular progress ring. Optional `label` below. |
| **BrandLogo** | Legacy wrapper with `variant` prop; prefer the components above. |

## Customising paths

Edit `assets.ts`:

- `icon` / `iconSvg` — mark only
- `logoBig` — full logo (large)
- `logoHorizontal` — horizontal lockup

## Usage

```tsx
import { LogoHorizontal, LogoBig, Icon, IconLoader, LogoStacked } from '../components';

// Header
<LogoHorizontal height={80} />

// Auth / landing
<LogoBig height={62} />

// Stacked (icon on top, wordmark below)
<LogoStacked iconHeight={48} wordmarkSize="medium" />

// Just the mark
<Icon height={36} useSvg />

// Loader (e.g. in LoadingEmptyStateWrapper)
<IconLoader label="Loading..." iconSize={40} ringSize={64} />
```

# Mantine API Reference (verified against mantine.dev)

> Researched 2026-06-06 against https://mantine.dev. Current version: **v9.3.0** — newer than the v7/v8 era most LLM memory covers; the v9 docs are the source of truth at https://mantine.dev.

## Setup

```bash
npm i @mantine/core @mantine/hooks
npm i -D postcss postcss-preset-mantine postcss-simple-vars
```

```jsx
import '@mantine/core/styles.css';          // REQUIRED — and per-package CSS, e.g. '@mantine/dates/styles.css'
import { createTheme, MantineProvider } from '@mantine/core';

const theme = createTheme({ /* overrides */ });
export default function App() {
  return <MantineProvider theme={theme}>{/* app */}</MantineProvider>;
}
```

`postcss.config.cjs`:
```js
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': { variables: {
      'mantine-breakpoint-xs': '36em', 'mantine-breakpoint-sm': '48em',
      'mantine-breakpoint-md': '62em', 'mantine-breakpoint-lg': '75em',
      'mantine-breakpoint-xl': '88em',
    }},
  },
};
```

SSR: add `<ColorSchemeScript />` to `<head>` and spread `mantineHtmlProps` on `<html>`.

## Packages

| Package | Contents |
|---|---|
| `@mantine/core` | All components below |
| `@mantine/hooks` | useDisclosure, useClickOutside, useDebouncedValue, useMediaQuery, useLocalStorage, etc. |
| `@mantine/form` | useForm form management |
| `@mantine/dates` | DatePicker, DateInput, Calendar, TimeInput… (needs own styles.css + dayjs) |
| `@mantine/charts` | Recharts-based charts |
| `@mantine/notifications` | notifications.show(...) system |
| `@mantine/modals` | modals manager |
| `@mantine/spotlight` | command palette |
| `@mantine/dropzone` | file dropzone |
| `@mantine/carousel` | embla-based carousel |
| `@mantine/tiptap` | rich text editor |
| `@mantine/code-highlight` | code highlighting |
| `@mantine/nprogress` | navigation progress bar |

## @mantine/core components (v9.3 — complete list)

- **Layout:** AppShell, AspectRatio, Center, Container, Flex, Grid, Group (horizontal), SimpleGrid, Space, Splitter, Stack (vertical)
- **Inputs:** AlphaSlider, AngleSlider, Checkbox, Chip, ColorInput, ColorPicker, Fieldset, FileInput, HueSlider, Input, JsonInput, MaskInput, NativeSelect, NumberInput, PasswordInput, PinInput, Radio, RangeSlider, Rating, SegmentedControl, Slider, Switch, Textarea, TextInput
- **Combobox family:** Autocomplete, Combobox (primitive), MultiSelect, Pill, PillsInput, Select, TagsInput, TreeSelect
- **Buttons:** ActionIcon (icon button), Button, CloseButton, CopyButton, FileButton, UnstyledButton
- **Navigation:** Anchor, Breadcrumbs, Burger, NavLink, Pagination, Stepper, TableOfContents, Tabs, Tree
- **Feedback:** Alert, Loader, Notification, Progress, RingProgress, SemiCircleProgress, Skeleton
- **Overlays:** Affix, Dialog, Drawer, FloatingIndicator, FloatingWindow, HoverCard, LoadingOverlay, Menu, Modal, Overlay, Popover, Tooltip
- **Data display:** Accordion, Avatar, BackgroundImage, Badge, Card, ColorSwatch, Image, Indicator, Kbd, NumberFormatter, OverflowList, RollingNumber, Spoiler, ThemeIcon, Timeline
- **Typography:** Blockquote, Code, Highlight, List, Mark, Table, Text, Title, Typography
- **Misc:** Box, Collapse, Divider, FocusTrap, Marquee, Paper, Portal, ScrollArea, Scroller, Transition, VisuallyHidden

## Style props (on every component)

- Spacing: `m mt mb ml mr ms me mx my p pt pb pl pr ps pe px py`
- Visual: `bd bdrs bg c opacity`
- Typography: `ff fz fw lts ta lh fs tt td`
- Size: `w miw maw h mih mah`
- Background: `bgsz bgp bgr bga`; Position: `pos top left bottom right inset`; `display`, `flex`

Responsive object syntax: `<Box w={{ base: 200, sm: 400, lg: 500 }} />` (breakpoints: base/xs/sm/md/lg/xl).

## Hallucination traps (v6-era APIs that DO NOT exist in v7+)

- ❌ `sx` prop — removed in v7. Use `style`, style props, or CSS modules with `classNames`.
- ❌ `createStyles` — removed in v7. Use CSS modules.
- ❌ `<Group position="apart">` → ✅ `<Group justify="space-between">`
- ❌ `color` prop for text color on Text → ✅ `c` prop
- ❌ `useNotifications` hook → ✅ `notifications.show({ title, message })` from `@mantine/notifications`
- ❌ `NotificationsProvider` → ✅ `<Notifications />` component mounted once
- Modals via `useDisclosure`: `const [opened, { open, close }] = useDisclosure(false)` then `<Modal opened={opened} onClose={close}>`
- Components use `classNames`/`styles` props targeting named inner elements for granular styling.

## Sources
- https://mantine.dev/getting-started/ (v9.3.0)
- https://mantine.dev/core/package/ (component list)
- https://mantine.dev/styles/style-props/

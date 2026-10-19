# Я шагаю по Казани — демо

Ветка `demo/home-foundation`: только основа и главная, Figma 6:835 / вариант 6:822.

- React / TypeScript / Vite; Capacitor iOS. Android отложен.
- `app/` — новая версия. Старые пять файлов в корне сохранены; main и GitHub Pages не меняются.
- `app/src/data/localHomeRepository.ts` — локальные демонстрационные данные, без Supabase.
- `app/src/platform/` — контракты для будущих нативных аудио, файлов и позиций.
- SQLite и API планируются на VPS, пока не развёрнуты.
- `archive/reference/` — сохранённые только локально исторические данные; исключены из Git и публикации.

## Запуск

Node 24, pnpm 11.25.0. `pnpm install --frozen-lockfile`, `pnpm dev`.
`pnpm build` проверяет TypeScript и собирает `dist/`. `pnpm test:e2e` — браузерные проверки.

## Ресурсы

Требуются оригинальные экспорты Figma: `app/public/assets/home/zilant-hello.png`, `kremlin.jpg`, `zilant-face.svg`. Доступность задаётся в `app/src/data/assets.ts`. Недоступные оригиналы не подменяются похожими картинками. Шрифты поставляются локально с OFL-лицензиями из Fontsource. Иконки Phosphor выбраны по именам слоёв; точность требует сверки с оригинальными SVG.

## iPhone

Capacitor поддерживает iPhone XR (deployment target iOS 15+). Для сборки нужен macOS/Xcode. CI создаёт устройство arm64, а не симулятор, и упаковывает неподписанный `Payload/App.app` в IPA. Sideloadly подписывает его на Windows Apple ID пользователя. Секреты Apple в CI не используются. Фоновое аудио и скачивание маршрутов пока не реализованы; для них предусмотрены платформенные адаптеры.

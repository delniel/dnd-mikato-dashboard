# DnD Mikato Edition — character dashboard

Бесплатный статический лист персонажа для DnD Mikato Edition. Новый браузер начинает с пустого персонажа; данные и загруженные изображения сохраняются только локально в IndexedDB этого браузера.

## Локальный запуск

```bash
npm install
npm run dev
```

Обязательные проверки: `npm run lint`, `npm run test`, `npm run build`.

## Резервные копии

В настройках можно экспортировать и импортировать JSON листа. Пользовательские изображения хранятся отдельно в браузере и в JSON не входят.

## Публикация

Workflow `.github/workflows/pages.yml` собирает проект и публикует `dist` в GitHub Pages. В настройках репозитория выберите **Settings → Pages → Source: GitHub Actions**.

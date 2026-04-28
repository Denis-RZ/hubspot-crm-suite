# HubSpot Deals Sandbox

Отдельная песочница для практики с `HubSpot Deals`, лежит рядом с `HHUpdate2` и не добавлена в основной solution.

## Что внутри

- `HubSpotDealsClient` на чистом `HttpClient`
- чтение списка сделок
- получение сделки по `id`
- создание сделки из JSON-файла
- обновление сделки из JSON-файла

## HubSpot sandbox

Проект работает с HubSpot через Private App token. Для приватного серверного
деплоя токен лежит в `appsettings.json` в секции `HubSpot:AccessToken`.
Переменная окружения `HUBSPOT_ACCESS_TOKEN` может переопределить это значение.
Токен не отдается в браузер и не хранится во frontend-файлах.

Минимальные scopes для private app:

- `crm.objects.deals.read/write`
- `crm.objects.contacts.read/write`
- `crm.objects.companies.read/write`
- association read/write scopes для deal-contact и deal-company связей

## Перед запуском

```powershell
dotnet run -- web
```

## Команды

Из папки `hubspot-deals-sandbox`:

```powershell
dotnet run -- list 10
dotnet run -- get 123456789
dotnet run -- create-from-file .\sample-create-deal.json
dotnet run -- update-from-file 123456789 .\sample-create-deal.json
```

## Важное замечание

Файл `sample-create-deal.json` содержит пример. Перед `create` почти наверняка нужно заменить:

- `dealstage` на валидный stage id из твоего HubSpot аккаунта
- при необходимости `pipeline`

Если нужен следующий шаг для подготовки, логично будет добавить:

- `search` по фильтрам
- `associations` с `contacts` и `companies`
- `OAuth` вместо ручного токена

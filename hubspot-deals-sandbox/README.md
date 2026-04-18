# HubSpot Deals Sandbox

Отдельная песочница для практики с `HubSpot Deals`, лежит рядом с `HHUpdate2` и не добавлена в основной solution.

## Что внутри

- `HubSpotDealsClient` на чистом `HttpClient`
- чтение списка сделок
- получение сделки по `id`
- создание сделки из JSON-файла
- обновление сделки из JSON-файла

## Тестовый аккаунт (developer sandbox)

| Параметр | Значение |
|----------|----------|
| Email | baidu27@gmail.com |
| Password | Hhupdate2026! |
| Developer Portal ID | 245936867 |
| Developer Portal URL | https://app-na2.hubspot.com/developer-overview/245936867 |
| CRM Test Account Portal ID | 245936905 |
| CRM Test Account URL | https://app-na2.hubspot.com/private-apps/245936905 |

### Private App (HHUpdate-Sandbox)

Создан в CRM Test Account (portal 245936905).

Scopes: `crm.objects.deals.read/write`, `crm.objects.contacts.read/write`, `crm.objects.companies.read/write`

| Параметр | Значение |
|----------|----------|
| App ID | 36939381 |
| Access Token | pat-na2-a8cfa91f-5d5e-4e0c-abfa-a244c19fae23 |

## Перед запуском

```powershell
$env:HUBSPOT_ACCESS_TOKEN = "pat-na2-a8cfa91f-5d5e-4e0c-abfa-a244c19fae23"
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

# HubSpot CRM Local Stand

Локальный `ASP.NET Core` стенд для изучения структуры CRM без токена и без реального HubSpot аккаунта.

## Что дает стенд

- `Swagger UI` в браузере
- in-memory данные по `deals`, `contacts`, `companies`
- `HubSpot-like` маршруты
- свойства объектов (`properties`)
- пайплайн сделок (`pipelines`)
- связи между объектами (`associations`)

## Как запустить

Из папки `hubspot-crm-local-stand`:

```powershell
dotnet run
```

После старта откроется:

```text
http://localhost:5078/swagger
```

## Что смотреть первым

- `GET /crm/v3/mock/schema`
- `GET /crm/v3/properties/deals`
- `GET /crm/v3/properties/contacts`
- `GET /crm/v3/properties/companies`
- `GET /crm/v3/pipelines/deals`
- `GET /crm/v3/objects/deals`
- `GET /crm/v3/objects/contacts`
- `GET /crm/v3/objects/companies`

## Что можно попробовать руками

Пример создания сделки:

```json
{
  "properties": {
    "dealname": "Lab stand deal",
    "amount": "22000",
    "dealstage": "qualifiedtobuy",
    "pipeline": "default",
    "closedate": "2026-05-10T00:00:00Z"
  },
  "associations": [
    {
      "toObjectType": "contacts",
      "toObjectId": "3001"
    },
    {
      "toObjectType": "companies",
      "toObjectId": "4001"
    }
  ]
}
```

Пример частичного обновления сделки:

```json
{
  "properties": {
    "amount": "25000",
    "dealstage": "contractsent"
  }
}
```

## Ограничения

- это не настоящий HubSpot и не полная копия API
- данные живут только в памяти процесса
- после перезапуска стенд возвращается к стартовым данным

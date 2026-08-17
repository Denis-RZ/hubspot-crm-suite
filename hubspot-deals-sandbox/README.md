# CRM Sandbox

CRM-система, написанная с нуля: сделки, контакты, компании, дефекты
производства (QA), плагины, импорт/экспорт CSV. Лежит рядом с `HHUpdate2`
и не добавлена в основной solution.

## Что внутри

- `LocalCrmStore` — собственный слой данных (in-memory + файл на диске)
- CRUD для deals/contacts/companies/defects
- связи (associations) между записями
- модульная система плагинов (ZIP → DLL + JS)
- CSV импорт/экспорт с предпросмотром валидации

## Хранение данных

Никакого внешнего сервиса и токенов не требуется. Все данные хранятся в
`App_Data/crm-store.json` — файл создаётся автоматически при первом запуске
с демо-данными и переживает перезапуск сервера.

## Перед запуском

```powershell
dotnet run -- web
```

Открывается на `http://localhost:5100`. Настраивать ничего не нужно.

## Команды

Из папки `hubspot-deals-sandbox`:

```powershell
dotnet run -- list 10
dotnet run -- get 123456789
dotnet run -- create-from-file .\sample-create-deal.json
dotnet run -- update-from-file 123456789 .\sample-create-deal.json
dotnet run -- search dealstage EQ appointmentscheduled
dotnet run -- associate 123456789 contacts 987654321
dotnet run -- associations 123456789 contacts
```

Все команды работают с тем же локальным файлом данных, что и веб-интерфейс.

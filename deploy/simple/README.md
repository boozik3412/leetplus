# Простой деплой LeetPlus (`lp`)

Это основной способ обновлять production с 29.09.2026. Он заменяет цепочку
legacy-контроллеров (native plan/GO/подписи, A → bridge → B, bootstrap),
которая остаётся в репозитории только как история.

## Как выглядит релиз

1. PR → обязательные проверки GitHub → merge в `main`.
2. Дождаться, пока на merge-коммите пройдут пять обязательных проверок
   (`Release impact classification`, `Fast authority root trust`,
   `Fast application checks`, `Release critical pilot HTTP and fresh store scope`,
   `Release critical PostgreSQL assortment isolation`). Full admission не ждём.
3. На сервере:

```bash
ssh root@192.168.1.137 lp deploy <sha>
```

`lp deploy` делает всё сам и останавливается при первой проблеме:

| Шаг | Что происходит |
| --- | --- |
| Проверка | коммит есть в `main`, обязательные проверки GitHub зелёные |
| Сборка | образы `leetplus-api:<sha>` и `leetplus-web:<sha>` собираются на сервере из исходников GitHub (лог: `/var/lib/leetplus-deploy/build-<sha>.log`) |
| Схема БД | число и последняя миграция в образе совпадают с базой; иначе отказ |
| Workers | entrypoint bonus/daily worker запускается на новом образе с их настоящими секретами в режиме самопроверки (`LEETPLUS_ENTRY_CHECK=1`, без сети, без работы); иначе отказ |
| Stage | новая версия поднимается в **резервном** слоте; рабочий слот не трогается |
| Проверка слота | Docker healthcheck + API `/health/ready` + Web `/api/release-identity` + главная страница |
| Switch | nginx `active.conf` переключается на новый слот, `nginx -t`, reload |
| Публичная проверка | `https://api.leetplus.ru/health/ready` и `https://leetplus.ru/api/release-identity` отдают новый SHA; иначе трафик автоматически возвращается |
| Workers | следующий тик bonus/daily worker идёт на новом релизе |

Старый слот остаётся запущенным. **Откат — одна команда, секунды:**

```bash
ssh root@192.168.1.137 lp rollback
```

## Команды

| Команда | Назначение |
| --- | --- |
| `lp status` | какой слот обслуживает трафик, версии и здоровье слотов, миграции, таймеры, последние действия |
| `lp build <sha>` | только собрать образы |
| `lp stage <sha>` | собрать и поднять в резервном слоте, без переключения |
| `lp switch` | переключить трафик на другой (здоровый) слот |
| `lp rollback` | то же, что `switch`: вернуться на предыдущий слот |
| `lp deploy <sha>` | `stage` + `switch` |
| `--force` | для `stage`/`deploy`: пропустить проверку `main` и CI (только авария) |

Все изменяющие команды берут общий lock: два деплоя одновременно не пойдут.
История действий: `/var/lib/leetplus-deploy/history.jsonl`, снимки
`compose.json` перед каждым изменением: `/var/lib/leetplus-deploy/compose-history/`.

## Что осталось от прежней раскладки

`lp` работает поверх того, что создал legacy-контроллер, и меняет только
образы API/Web слотов и workers:

- `/srv/leetplus/compose.json` — Compose-проект `leetplus`: слоты blue/green
  (Web 13100/13200, API 14100/14200 на loopback), PostgreSQL, Redis, workers;
- секреты `/srv/leetplus/secrets/*` и сети `leetplus-{blue,green,data,egress}`
  с фиксированными адресами — сетевые правила (`leetplus-compose-network`)
  привязаны к этим адресам и продолжают работать;
- nginx: `/etc/nginx/leetplus-compose/active.conf` → `blue.conf` | `green.conf`;
- ночной шифрованный бэкап (`leetplus-compose-backup.timer`, 01:00 UTC) и
  обновление адресов провайдеров (`leetplus-compose-network-refresh.timer`)
  пока выполняются legacy-контроллером; `lp` их не трогает.

Workers и запуск после перезагрузки переводятся на `lp` один раз:
`lp adopt --yes` отключает `leetplus-compose-{bonus,daily}.timer` и
`leetplus-compose-runtime.service` и включает `lp-bonus.timer`,
`lp-daily.timer`, `lp-runtime.service` (расписание прежнее). Lock-файлы workers
общие со старыми юнитами, поэтому тики не пересекаются.

## Ограничения текущей версии

- **Миграции БД `lp` пока не применяет.** Если в релизе новые миграции, `lp`
  откажется выкладывать. Сборка образа сейчас тоже требует ровно 191
  миграцию (`deploy/leetplus-compose/image-metadata.mjs`). Шаг миграций
  (дамп → `prisma migrate deploy` → выкладка) — следующая доработка; правило
  для миграций: только обратно-совместимые (expand → deploy → contract).
- Сборка идёт на production-хосте (56 ядер); при частых релизах стоит
  периодически удалять старые образы `leetplus-api/web`.

## Установка / обновление `lp`

С рабочей машины из корня репозитория:

```bash
tar -c -C deploy simple | ssh root@192.168.1.137 'rm -rf /root/lp-src && mkdir -p /root/lp-src && tar -x -C /root/lp-src && bash /root/lp-src/simple/install.sh'
```

`install.sh` копирует `lp.mjs` в `/opt/leetplus-deploy`, ставит команду
`/usr/local/sbin/lp` и юниты systemd, но ничего не включает.

Только статический preview; никаких API, SQLite, VPN или MCP изменений.
Каталог: /var/www/kazan-demo/releases/<commit>, current — атомарная ссылка.
ACME: отдельные /etc/kazan-demo-acme, /var/lib/kazan-demo-acme, /var/log/kazan-demo-acme.
Перед изменениями: nginx -t; резервная копия затрагиваемого vhost и nginx.conf.
Первый запуск: свободный server_name, HTTP webroot для ACME, существующий certbot без установки пакетов, затем проверка и HTTPS-конфигурация.
При неуспехе nginx -t конфигурацию не применять. Откат публикации — вернуть current на предыдущий release; первый vhost можно отключить удалением только ссылки sites-enabled/kazan-demo и reload после nginx -t.
Таймер продлевает только новый сертификат. Установочные файлы находятся в downloads отдельно от releases.

Первая публикация: 2026-10-19, HTTPS kazan-demo.38-180-191-162.sslip.io.
Первый release: bc87b96c0f0b1c4ba857c75cd62fb80f7477a3ba; последующие исправления CI содержимое web не меняют.
Резервная копия: /var/backups/kazan-demo/20261019T193932Z.
Конфигурация nginx проверена до/после; корни обоих прежних MCP сохранили HTTP 404 и валидный TLS.
Автопродление нового сертификата: отдельный kazan-demo-renew.timer.

Только статический preview; никаких API, SQLite, VPN или MCP изменений.
Каталог: /var/www/kazan-demo/releases/<commit>, current — атомарная ссылка.
ACME: отдельные /etc/kazan-demo-acme, /var/lib/kazan-demo-acme, /var/log/kazan-demo-acme.
Перед изменениями: nginx -t; резервная копия затрагиваемого vhost и nginx.conf.
Первый запуск: свободный server_name, HTTP webroot для ACME, существующий certbot без установки пакетов, затем проверка и HTTPS-конфигурация.
При неуспехе nginx -t конфигурацию не применять. Откат публикации — вернуть current на предыдущий release; первый vhost можно отключить удалением только ссылки sites-enabled/kazan-demo и reload после nginx -t.
Таймер продлевает только новый сертификат. Установочные файлы находятся в downloads отдельно от releases.

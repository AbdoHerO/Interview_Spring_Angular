# Interview Revision Hub — web tier (PHP/Apache).
#
# Serves the static frontend plus api.php (login, chat long-polling) and
# ai_proxy.php (server-side proxy to the Python AI service). The AI service and
# Qdrant are separate containers; see docker-compose.yml.
#
# php:8.2-apache is multi-arch, so this builds native on ARM or x86.
FROM php:8.2-apache

# curl, session, json, mbstring and fileinfo are all bundled in the official
# image — ai_proxy.php's curl_* calls need no extension install. opcache is
# added because this app has no build step, so recompiling every request on
# every page load is pure waste.
#
# remoteip matters here: without it api.php records the Nginx container address
# for every request instead of the real client.
RUN set -eux; \
    docker-php-ext-install -j"$(nproc)" opcache; \
    a2enmod rewrite headers remoteip

COPY docker/php.ini          /usr/local/etc/php/conf.d/zz-interview.ini
COPY docker/apache-site.conf /etc/apache2/sites-available/000-default.conf
COPY docker/entrypoint.sh    /usr/local/bin/interview-entrypoint
RUN chmod +x /usr/local/bin/interview-entrypoint

WORKDIR /var/www/html
COPY --chown=www-data:www-data . /var/www/html
COPY docker/health.php /var/www/html/health.php

# data/ holds chat.json and is written on every message, so it is a volume in
# production. This only creates the mount point with the right owner.
# data/.htaccess ships in the repo and blocks direct browser access to it.
RUN set -eux; \
    mkdir -p /var/www/html/data /var/lib/php/sessions; \
    chown -R www-data:www-data /var/www/html/data /var/lib/php/sessions; \
    chmod 700 /var/lib/php/sessions

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD php -r '$b=@file_get_contents("http://127.0.0.1/health.php"); exit($b==="ok"?0:1);'

ENTRYPOINT ["/usr/local/bin/interview-entrypoint"]
CMD ["apache2-foreground"]

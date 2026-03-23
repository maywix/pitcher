FROM nginx:alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
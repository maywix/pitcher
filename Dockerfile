FROM nginx:alpine

RUN rm -f /usr/share/nginx/html/index.html

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
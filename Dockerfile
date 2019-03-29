FROM centos:7

RUN yum -y install wget
RUN wget https://nodejs.org/dist/v10.15.3/node-v10.15.3-linux-x64.tar.xz
RUN tar -axf node-v10.15.3-linux-x64.tar.xz
RUN cp -r -t /usr/ ./node-v10.15.3-linux-x64/*
COPY main.js /
COPY package.json /
RUN npm i
CMD node main.js

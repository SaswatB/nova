# todo improve with https://turbo.build/repo/docs/handbook/deploying-with-docker
FROM public.ecr.aws/docker/library/node:16

ARG BUILD_CONTEXT
ENV BUILD_CONTEXT ${BUILD_CONTEXT}

WORKDIR /app

COPY . .
RUN yarn
RUN npx turbo run build --scope ${BUILD_CONTEXT}

WORKDIR ./apps/${BUILD_CONTEXT}
CMD npm run start

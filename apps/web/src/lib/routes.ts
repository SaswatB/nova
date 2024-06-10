type PathParams<T extends string> = T extends `${infer P}/:${infer U}/${infer V}`
  ? { [index in U]: string } & PathParams<P> & PathParams<`/${V}`>
  : T extends `${infer P}/:${infer U}`
    ? { [index in U]: string } & PathParams<P>
    : {};

function routeFactory<T extends string>(path: T) {
  const getPath = (...params: T extends `${string}/:${string}` ? [PathParams<T>] : []) =>
    params.length ? path.replace(/:([^/]+)/g, (_, key) => (params as [Record<string, string>])[0][key]!) : path;
  return {
    path,
    getPath,
    getFullPath: (
      ...params: T extends `${string}/:${string}` ? [host: string, param: PathParams<T>] : [host: string]
    ) => `${params[0]}${getPath(...(params.slice(1) as Parameters<typeof getPath>))}`,
  };
}

export const routes = {
  home: routeFactory("/"),
  project: routeFactory("/p/:projectId"),
  projectSpace: routeFactory("/p/:projectId/s/:spaceId"),
  projectSpacePage: routeFactory("/p/:projectId/s/:spaceId/pg/:pageId"),
};

export type RoutesPathParams = {
  [T in keyof typeof routes]: PathParams<(typeof routes)[T]["path"]>;
};

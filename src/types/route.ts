export type MatchedMethodSuffix =
  | 'delete'
  | 'get'
  | 'head'
  | 'options'
  | 'patch'
  | 'post'
  | 'put'
  | 'trace';

export type MatchedEnvSuffix = 'dev' | 'prod';

export type Metadata = {};

export type Route = {
  method?: MatchedMethodSuffix;
  env?: MatchedEnvSuffix;
  path: string;
  dynamic: boolean;
  filePath: string;
  sourceFilePath?: string;
  regex: string;
};

export type Query = {
  [key: string]: string | string[] | number | number[] | boolean;
};

export type Params = {
  [key: string]: string;
};

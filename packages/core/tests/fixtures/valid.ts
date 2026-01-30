/**
 * @file valid-module.mts
 */
export default async function (data: any) {
  return { received: data, status: "ok" };
}
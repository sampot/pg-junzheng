/** Optional Playgrounds functions entry; durable state uses the host /api/kv API. */
export default {
  async fetch(request) {
    return Response.json({
      ok: true,
      name: "pg-junzheng",
      path: new URL(request.url).pathname,
    });
  },
};

import { buildMongoUri } from "../src/configs/config.env";

describe("buildMongoUri", () => {
  it("appends the database name to a plain host", () => {
    expect(buildMongoUri("mongodb://localhost:27017", "cmsDB")).toBe(
      "mongodb://localhost:27017/cmsDB"
    );
  });

  it("does not double the slash when the URL ends with one", () => {
    expect(buildMongoUri("mongodb://localhost:27017/", "cmsDB")).toBe(
      "mongodb://localhost:27017/cmsDB"
    );
  });

  it("handles an Atlas SRV URL with a trailing slash", () => {
    expect(
      buildMongoUri("mongodb+srv://u:p@datn.pywijgp.mongodb.net/", "cmsDB")
    ).toBe("mongodb+srv://u:p@datn.pywijgp.mongodb.net/cmsDB");
  });

  it("keeps query options and puts the name before them", () => {
    expect(
      buildMongoUri(
        "mongodb+srv://u:p@datn.pywijgp.mongodb.net/?retryWrites=true&w=majority&appName=datn",
        "cmsDB"
      )
    ).toBe(
      "mongodb+srv://u:p@datn.pywijgp.mongodb.net/cmsDB?retryWrites=true&w=majority&appName=datn"
    );
  });

  it("replaces a database name already present in the URL", () => {
    expect(
      buildMongoUri("mongodb+srv://u:p@host.mongodb.net/otherDB", "cmsDB")
    ).toBe("mongodb+srv://u:p@host.mongodb.net/cmsDB");
  });

  it("replaces an existing name while preserving options", () => {
    expect(
      buildMongoUri(
        "mongodb+srv://u:p@host.mongodb.net/otherDB?retryWrites=true",
        "cmsDB"
      )
    ).toBe("mongodb+srv://u:p@host.mongodb.net/cmsDB?retryWrites=true");
  });

  it("survives a password containing special characters", () => {
    // Atlas passwords are percent-encoded by the user; the host split must not
    // be confused by '@' or '/' inside the credentials section.
    expect(
      buildMongoUri("mongodb+srv://user:p%40ss%2Fword@host.mongodb.net/", "cmsDB")
    ).toBe("mongodb+srv://user:p%40ss%2Fword@host.mongodb.net/cmsDB");
  });

  it("supports a replica set host list", () => {
    expect(
      buildMongoUri("mongodb://h1:27017,h2:27017/?replicaSet=rs0", "cmsDB")
    ).toBe("mongodb://h1:27017,h2:27017/cmsDB?replicaSet=rs0");
  });

  it("refuses an empty URL rather than building a broken URI", () => {
    expect(() => buildMongoUri("", "cmsDB")).toThrow(
      /MongoDB URL is not configured/
    );
  });
});

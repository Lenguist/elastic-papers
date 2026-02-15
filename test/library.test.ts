import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/library/route";
import { POST as POSTRemove } from "@/app/api/library/remove/route";
import { resetLibrary } from "@/lib/library-store";

const base = "http://localhost";

describe("Library API", () => {
  beforeEach(() => {
    resetLibrary();
  });

  describe("GET /api/library", () => {
    it("returns empty papers when library is empty", async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ papers: [] });
    });

    it("returns papers after adding", async () => {
      await POST(
        new Request(`${base}/api/library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            papers: [{ id: "2601.12345", title: "Test Paper" }],
          }),
        })
      );
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.papers).toHaveLength(1);
      expect(data.papers[0]).toMatchObject({
        id: "2601.12345",
        title: "Test Paper",
        url: "https://arxiv.org/abs/2601.12345",
      });
    });
  });

  describe("POST /api/library (add)", () => {
    it("returns 400 for invalid JSON", async () => {
      const res = await POST(
        new Request(`${base}/api/library`, {
          method: "POST",
          body: "not json",
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid JSON");
    });

    it("returns 400 when papers is missing or empty", async () => {
      const res = await POST(
        new Request(`${base}/api/library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("papers");

      const res2 = await POST(
        new Request(`${base}/api/library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ papers: [] }),
        })
      );
      expect(res2.status).toBe(400);
    });

    it("adds papers and returns added count", async () => {
      const res = await POST(
        new Request(`${base}/api/library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            papers: [
              { id: "2601.00001", title: "First" },
              { id: "2601.00002", title: "Second", url: "https://example.com/2" },
            ],
          }),
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.added).toBe(2);
      expect(data.total).toBe(2);
      expect(data.papers).toHaveLength(2);
      expect(data.papers[0].title).toBe("First");
      expect(data.papers[1].url).toBe("https://example.com/2");
    });

    it("skips duplicates and only adds new papers", async () => {
      await POST(
        new Request(`${base}/api/library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            papers: [{ id: "2601.11111", title: "One" }],
          }),
        })
      );
      const res = await POST(
        new Request(`${base}/api/library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            papers: [
              { id: "2601.11111", title: "One" },
              { id: "2601.22222", title: "Two" },
            ],
          }),
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.added).toBe(1);
      expect(data.total).toBe(2);
      expect(data.papers).toHaveLength(1);
      expect(data.papers[0].id).toBe("2601.22222");
    });

    it("normalizes missing title and url", async () => {
      const res = await POST(
        new Request(`${base}/api/library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            papers: [{ id: "2602.99999" }],
          }),
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.papers[0]).toMatchObject({
        id: "2602.99999",
        title: "Untitled",
        url: "https://arxiv.org/abs/2602.99999",
      });
    });
  });

  describe("POST /api/library/remove (remove)", () => {
    it("returns 400 for invalid JSON", async () => {
      const res = await POSTRemove(
        new Request(`${base}/api/library/remove`, {
          method: "POST",
          body: "not json",
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid JSON");
    });

    it("returns 400 when paper_ids is not an array", async () => {
      const res = await POSTRemove(
        new Request(`${base}/api/library/remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("paper_ids");
    });

    it("removes papers by id and returns counts", async () => {
      await POST(
        new Request(`${base}/api/library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            papers: [
              { id: "2601.a", title: "A" },
              { id: "2601.b", title: "B" },
              { id: "2601.c", title: "C" },
            ],
          }),
        })
      );
      const res = await POSTRemove(
        new Request(`${base}/api/library/remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paper_ids: ["2601.a", "2601.c"] }),
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.removed).toBe(2);
      expect(data.total).toBe(1);

      const getRes = await GET();
      const list = await getRes.json();
      expect(list.papers).toHaveLength(1);
      expect(list.papers[0].id).toBe("2601.b");
    });

    it("no-ops for ids not in library", async () => {
      await POST(
        new Request(`${base}/api/library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            papers: [{ id: "2601.only", title: "Only" }],
          }),
        })
      );
      const res = await POSTRemove(
        new Request(`${base}/api/library/remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paper_ids: ["9999.00000", "2601.only"] }),
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.removed).toBe(1);
      expect(data.total).toBe(0);
    });
  });
});

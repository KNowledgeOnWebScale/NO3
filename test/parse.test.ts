import * as N3 from 'n3';
import { parseN3 , parseStatements, store2string} from "../src/parse";

describe("parseN3", () =>  {
  test("should return an N3.Store", async () => {
      const store = await parseN3('<a> a <b> .');
      expect(store).toBeInstanceOf(N3.Store);
  });
});

describe("store2string", () => {
  test("should return a string", async () => {
      const store = await parseN3('<a> a <b> .'); 
      const str   = await store2string(store);
      expect(str).toMatch("<a> a <b>.");
  });
});

describe("parseStatements", () =>  {

  describe("<a> a <b> .", () => {

      test("should be one statement", async () => {
          const st = await PS('<a> a <b> .');
          expect(st.length).toBe(1);
      });
      
      test("should be one quad", async () => {
          const st = await PS('<a> a <b> .');
          expect(st[0].length).toBe(1);
      });

      test("should be instance of N3.Quad", async () => {
          const st = await PS('<a> a <b> .');
          expect(st[0][0]).toBeInstanceOf(N3.Quad);
      });
  });

  describe("<a> a <b> . <c> a <d>", () => {

    test("should be one statement", async () => {
        const st = await PS('<a> a <b> . <c> a <d> .');
        expect(st.length).toBe(2);
    });
    
    test("should be one quad", async () => {
        const st = await PS('<a> a <b> . <c> a <d> .');
        expect(st[0].length).toBe(1);
    });

    test("should be one quad", async () => {
        const st = await PS('<a> a <b> . <c> a <d> .');
        expect(st[1].length).toBe(1);
    });

    test("should be instance of N3.Quad", async () => {
        const st = await PS('<a> a <b> . <c> a <d> .');
        expect(st[0][0]).toBeInstanceOf(N3.Quad);
    });

    test("should be instance of N3.Quad", async () => {
        const st = await PS('<a> a <b> . <c> a <d> .');
        expect(st[1][0]).toBeInstanceOf(N3.Quad);
    });
  });

  describe("<a> a ( <b> <c> <d> ) .", () => {

    test("should be one statement", async () => {
        const st = await PS('<a> a ( <b> <c> <d> ) .');
        expect(st.length).toBe(1);
    });
    
    test("should be 7 quads", async () => {
        const st = await PS('<a> a ( <b> <c> <d> ) .');
        expect(st[0].length).toBe(7);
    });
  });

  describe("<a> a [ <b> <c> ] .", () => {

    test("should be one statement", async () => {
        const st = await PS('<a> a [ <b> <c> ] .');
        expect(st.length).toBe(1);
    });
    
    test("should be 2 quads", async () => {
        const st = await PS('<a> a [ <b> <c> ] .');
        expect(st[0].length).toBe(2);
    });
  });
});

async function PS(n3:string) {
    const store = await parseN3(n3);
    const st    = parseStatements(store, null, null, null, null);  
    return st;
}
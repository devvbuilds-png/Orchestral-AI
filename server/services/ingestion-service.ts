import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import * as cheerio from "cheerio";
import { supabase, UPLOADS_BUCKET } from "../supabase-storage";

export async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  
  try {
    switch (ext) {
      case ".txt":
      case ".md":
        return fs.readFileSync(filePath, "utf-8");
      
      case ".pdf":
        return await extractFromPDF(filePath);
      
      case ".docx":
      case ".doc":
        return await extractFromDOCX(filePath);
      
      default:
        return fs.readFileSync(filePath, "utf-8");
    }
  } catch (error) {
    console.error(`Failed to extract text from ${filePath}:`, error);
    throw new Error(`Failed to extract text from file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function extractFromPDF(filePath: string): Promise<string> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const dataBuffer = fs.readFileSync(filePath);
    const uint8Array = new Uint8Array(dataBuffer);
    
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || "")
        .join(" ");
      fullText += pageText + "\n";
    }
    
    return fullText.trim();
  } catch (error) {
    console.error("PDF extraction error:", error);
    throw new Error("Failed to extract text from PDF. Make sure the file is a valid PDF.");
  }
}

async function extractFromDOCX(filePath: string): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    console.error("DOCX extraction error:", error);
    throw new Error("Failed to extract text from DOCX. Make sure the file is a valid Word document.");
  }
}

export async function fetchUrlContent(url: string): Promise<{ text: string; title?: string }> {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PKBBot/1.0; +https://pkb.example.com)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      maxContentLength: 10 * 1024 * 1024,
    });

    const contentType = response.headers["content-type"] || "";
    
    if (contentType.includes("application/json")) {
      return { 
        text: JSON.stringify(response.data, null, 2),
        title: url 
      };
    }

    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const $ = cheerio.load(response.data);

    $("script, style, nav, footer, header, aside, .cookie-banner, .advertisement, #comments").remove();

    const title = $("title").text().trim() || 
                  $('meta[property="og:title"]').attr("content") ||
                  $("h1").first().text().trim();

    const description = $('meta[name="description"]').attr("content") ||
                       $('meta[property="og:description"]').attr("content") || "";

    const mainContent = $("main, article, .content, #content, .post, .page").first();
    
    let text = "";
    
    if (mainContent.length) {
      text = mainContent.text();
    } else {
      text = $("body").text();
    }

    text = text
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    const fullText = description ? `${description}\n\n${text}` : text;

    return { text: fullText, title };
  } catch (error) {
    console.error("URL fetch error:", error);
    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNABORTED") {
        throw new Error("Request timed out. The website took too long to respond.");
      }
      if (error.response?.status === 403) {
        throw new Error("Access denied. The website blocked our request.");
      }
      if (error.response?.status === 404) {
        throw new Error("Page not found. Please check the URL.");
      }
    }
    throw new Error(`Failed to fetch URL: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export interface CrawlResult {
  pages: Array<{
    url: string;
    title: string;
    text: string;
  }>;
  totalPages: number;
  errors: string[];
}

export interface CrawlProgress {
  current: number;
  total: number;
  currentUrl: string;
}

export async function crawlWebsite(
  baseUrl: string,
  options: {
    maxPages?: number;
    maxDepth?: number;
    onProgress?: (progress: CrawlProgress) => void;
  } = {}
): Promise<CrawlResult> {
  const { maxPages = 50, maxDepth = 3, onProgress } = options;
  
  const parsedBase = new URL(baseUrl);
  const baseDomain = parsedBase.hostname;
  const baseOrigin = parsedBase.origin;
  
  const visited = new Set<string>();
  const toVisit: Array<{ url: string; depth: number }> = [{ url: baseUrl, depth: 0 }];
  const pages: CrawlResult["pages"] = [];
  const errors: string[] = [];

  function normalizeUrl(url: string, currentUrl: string): string | null {
    try {
      let absoluteUrl: URL;
      
      if (url.startsWith("//")) {
        absoluteUrl = new URL(`${parsedBase.protocol}${url}`);
      } else if (url.startsWith("/")) {
        absoluteUrl = new URL(`${baseOrigin}${url}`);
      } else if (url.startsWith("http://") || url.startsWith("https://")) {
        absoluteUrl = new URL(url);
      } else if (!url.startsWith("#") && !url.startsWith("mailto:") && !url.startsWith("tel:") && !url.startsWith("javascript:")) {
        absoluteUrl = new URL(url, currentUrl);
      } else {
        return null;
      }

      if (absoluteUrl.hostname !== baseDomain) {
        return null;
      }

      absoluteUrl.hash = "";
      
      const skipExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".mp4", ".mp3", ".zip", ".doc", ".docx", ".xls", ".xlsx"];
      const pathLower = absoluteUrl.pathname.toLowerCase();
      if (skipExtensions.some(ext => pathLower.endsWith(ext))) {
        return null;
      }

      return absoluteUrl.href;
    } catch {
      return null;
    }
  }

  function extractLinks($: cheerio.CheerioAPI, currentUrl: string): string[] {
    const links: string[] = [];
    
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const normalized = normalizeUrl(href, currentUrl);
        if (normalized && !visited.has(normalized)) {
          links.push(normalized);
        }
      }
    });

    return Array.from(new Set(links));
  }

  while (toVisit.length > 0 && pages.length < maxPages) {
    const { url, depth } = toVisit.shift()!;
    
    if (visited.has(url)) continue;
    visited.add(url);

    if (onProgress) {
      onProgress({
        current: pages.length + 1,
        total: Math.min(visited.size + toVisit.length, maxPages),
        currentUrl: url,
      });
    }

    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PKBBot/1.0; +https://pkb.example.com)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        maxContentLength: 5 * 1024 * 1024,
        maxRedirects: 5,
      });

      const contentType = response.headers["content-type"] || "";
      if (!contentType.includes("text/html")) {
        continue;
      }

      const $ = cheerio.load(response.data);

      if (depth < maxDepth) {
        const links = extractLinks($, url);
        for (const link of links) {
          if (!visited.has(link) && !toVisit.some(item => item.url === link)) {
            toVisit.push({ url: link, depth: depth + 1 });
          }
        }
      }

      $("script, style, nav, footer, header, aside, .cookie-banner, .advertisement, #comments, noscript, iframe").remove();

      const title = $("title").text().trim() || 
                    $('meta[property="og:title"]').attr("content") ||
                    $("h1").first().text().trim() ||
                    url;

      const mainContent = $("main, article, .content, #content, .post, .page, [role='main']").first();
      
      let text = "";
      if (mainContent.length) {
        text = mainContent.text();
      } else {
        text = $("body").text();
      }

      text = text
        .replace(/\s+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();

      if (text.length > 100) {
        pages.push({ url, title, text });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Failed to fetch ${url}: ${message}`);
    }
  }

  return {
    pages,
    totalPages: pages.length,
    errors,
  };
}

export function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/ +/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/gm, "")
    .trim();
}

export function chunkText(text: string, maxChunkSize: number = 16000): string[] {
  const cleanedText = cleanText(text);
  
  if (cleanedText.length <= maxChunkSize) {
    return [cleanedText];
  }

  const chunks: string[] = [];
  const paragraphs = cleanedText.split(/\n\n+/);
  
  let currentChunk = "";
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      
      if (paragraph.length > maxChunkSize) {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length + 1 > maxChunkSize) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
              currentChunk = "";
            }
          }
          currentChunk += (currentChunk ? " " : "") + sentence;
        }
      } else {
        currentChunk = paragraph;
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

export async function processUploadedFile(
  productId: string,
  file: Express.Multer.File
): Promise<{ text: string; filename: string }> {
  const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");

  // Write to OS temp dir for text extraction (PDF/DOCX parsers need a file path)
  const tmpPath = path.join(os.tmpdir(), `pkb_upload_${Date.now()}_${safeName}`);
  fs.writeFileSync(tmpPath, file.buffer);

  let cleanedText: string;
  try {
    const text = await extractTextFromFile(tmpPath);
    cleanedText = cleanText(text);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }

  // Upload file buffer to Supabase Storage for persistent storage
  const { error } = await supabase.storage
    .from(UPLOADS_BUCKET)
    .upload(`product_${productId}/${safeName}`, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });
  if (error) {
    throw new Error(`Failed to upload ${safeName} to storage: ${error.message}`);
  }

  return { text: cleanedText, filename: safeName };
}

// Stores fetched URL text in Supabase so /process doesn't need to re-fetch.
export async function storeUrlText(productId: string, url: string, text: string): Promise<void> {
  const slug = url.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 120);
  const storagePath = `product_${productId}/url_${slug}.txt`;
  const { error } = await supabase.storage
    .from(UPLOADS_BUCKET)
    .upload(storagePath, text, { contentType: "text/plain", upsert: true, cacheControl: "0" });
  if (error) {
    console.error(`Failed to store URL text for ${url}:`, error.message);
  }
}

// Loads previously stored URL text from Supabase. Returns null if not found.
export async function loadStoredUrlText(productId: string, url: string): Promise<string | null> {
  const slug = url.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 120);
  const storagePath = `product_${productId}/url_${slug}.txt`;
  const { data, error } = await supabase.storage.from(UPLOADS_BUCKET).download(storagePath);
  if (error || !data) return null;
  return await data.text();
}

// Downloads a stored product file from Supabase and extracts its text.
// Used by the /process pipeline to re-read documents for extraction.
export async function extractTextFromStoredFile(productId: string, filename: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(UPLOADS_BUCKET)
    .download(`product_${productId}/${filename}`);

  if (error || !data) {
    throw new Error(`File not found in storage: product_${productId}/${filename}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const ext = path.extname(filename).toLowerCase();
  const tmpPath = path.join(os.tmpdir(), `pkb_read_${Date.now()}_${filename}`);
  fs.writeFileSync(tmpPath, buffer);

  try {
    const text = await extractTextFromFile(tmpPath);
    return cleanText(text);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

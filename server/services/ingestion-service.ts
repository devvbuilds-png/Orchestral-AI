import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export function getUploadPath(sessionId: string, filename: string): string {
  const sessionUploadsDir = path.join(UPLOADS_DIR, sessionId);
  if (!fs.existsSync(sessionUploadsDir)) {
    fs.mkdirSync(sessionUploadsDir, { recursive: true });
  }
  return path.join(sessionUploadsDir, filename);
}

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
    const pdfParse = await import("pdf-parse");
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse.default(dataBuffer);
    return data.text;
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

export function chunkText(text: string, maxChunkSize: number = 4000): string[] {
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
  sessionId: string,
  file: Express.Multer.File
): Promise<{ text: string; filename: string }> {
  ensureUploadsDir();
  
  const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
  const uploadPath = getUploadPath(sessionId, safeName);
  
  fs.writeFileSync(uploadPath, file.buffer);
  
  const text = await extractTextFromFile(uploadPath);
  const cleanedText = cleanText(text);
  
  return { text: cleanedText, filename: safeName };
}

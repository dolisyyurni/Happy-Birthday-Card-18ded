const axios = require("axios").default;
const path = require("path");
const fs = require("fs");
const setPic = require("./getPic");
const genIndex = require("./genIndex");
const {
  generateMarkupLocal,
  generateMarkupRemote,
} = require("./generateMarkup");

require("dotenv").config();

if (!process.env.NAME) throw new Error("Please specify NAME in environment.");
if (!process.env.PIC) throw new Error("Please specify PIC in environment.");

const picPath = process.env.PIC;
const msgPath = process.env.SCROLL_MSG;

//Local initialization
const setLocalData = async () => {
  try {
    const pic = path.join(__dirname, "../local/", picPath);
    let markup = "";
    if (msgPath) {
      const text = fs.readFileSync(path.join(__dirname, "../local/", msgPath), {
        encoding: "utf-8",
      });
      markup = generateMarkupLocal(text);
    }
    await setPic(pic);
    genIndex(markup);
  } catch (e) {
    throw new Error(e.message);
  }
};

//Remote initialization
const setRemoteData = async () => {
  try {
    // Google Drive's /file/d/.../view page is HTML, not an image. Convert
    // shared-file URLs to the direct download endpoint before passing them to sharp.
    const driveFileId = picPath.match(/drive\.google\.com\/file\/d\/([^/]+)/)?.[1];
    const imageUrl = driveFileId
      ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}`
      : picPath;

    let res = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    });

    const pic = res.data;
    let markup = "";

    if (msgPath) {
      const article = msgPath.split("/").pop();

      res = await axios.get(`https://api.telegra.ph/getPage/${encodeURIComponent(article)}?return_content=true`
      );

      console.log("Telegraph response:", res.data);

      if (!res.data.ok) {
        throw new Error(`Telegraph API Error: ${res.data.error}`);
      }

      const { content } = res.data.result;

      if (!content) {
        throw new Error("Telegraph page does not contain content.");
      }

      markup = content.reduce(
        (string, node) => string + generateMarkupRemote(node),
        ""
      );
    }

    await setPic(pic);
    genIndex(markup);

  } catch (e) {
    console.error("Remote initialization failed!");
    console.error("Error code:", e.code);
    console.error("Error message:", e.message);
    console.error("HTTP status:", e.response?.status);
    console.error("Response data:", e.response?.data);

    // A local image and message let builds complete when the remote source is
    // temporarily unavailable (for example, in an offline development environment).
    const localDir = path.join(__dirname, "../local");
    const configuredLocalPic = path.join(localDir, picPath);
    const localImages = fs.existsSync(localDir)
      ? fs.readdirSync(localDir).filter((file) => /\.(jpe?g|png|webp|gif)$/i.test(file))
      : [];
    const fallbackPic = fs.existsSync(configuredLocalPic)
      ? configuredLocalPic
      : localImages.length === 1
        ? path.join(localDir, localImages[0])
        : null;

    if (!fallbackPic) throw e;

    console.warn(`Using local image fallback: ${path.basename(fallbackPic)}`);
    let markup = "";
    const localMessage = path.join(localDir, msgPath || "");
    if (msgPath && fs.existsSync(localMessage)) {
      markup = generateMarkupLocal(fs.readFileSync(localMessage, "utf-8"));
    }
    await setPic(fallbackPic);
    genIndex(markup);
  }
};

if (process.argv[2] === "--local") setLocalData();
else if (process.argv[2] === "--remote") setRemoteData();
else console.log("Fetch mode not specified.");

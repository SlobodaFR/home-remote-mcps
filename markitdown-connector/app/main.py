import base64
import io
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from markitdown import MarkItDown, StreamInfo
from pydantic import BaseModel

from .security import require_internal_secret

app = FastAPI(title="markitdown-connector", docs_url=None, redoc_url=None)

# Stateless conversion, no per-request config - one shared instance is fine.
_markitdown = MarkItDown()


class ConvertRequest(BaseModel):
    url: str | None = None
    base64Content: str | None = None
    filename: str | None = None


@app.post("/convert", dependencies=[Depends(require_internal_secret)])
def post_convert(body: ConvertRequest) -> dict[str, Any]:
    if body.url:
        result = _markitdown.convert(body.url)
    elif body.base64Content:
        stream_info = StreamInfo(filename=body.filename) if body.filename else None
        result = _markitdown.convert_stream(
            io.BytesIO(base64.b64decode(body.base64Content)),
            stream_info=stream_info,
        )
    else:
        raise HTTPException(
            status_code=400, detail="Provide either 'url' or 'base64Content'"
        )
    return {"markdown": result.text_content}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

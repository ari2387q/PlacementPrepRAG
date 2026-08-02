from pathlib import Path
from typing import Any

from langchain_community.document_loaders import PyPDFLoader


def load_all_documents(data_dir:str)-> list[Any]:
    data_path=Path(data_dir).resolve()
    print(f"[DEBUG] Data path: {data_path}")

    documents=[]

    pdf_files= list(data_path.glob('**/*.pdf'))
    print(f"[DEBUG] Found {len(pdf_files)} PDF files: {[str(f) for f in pdf_files]}")
    for pdf_file in pdf_files:
        print(f"[DEBUG] Loading PDF: {pdf_file}")
        try:

            loader=PyPDFLoader(str(pdf_file))
            loaded=loader.load()
            print(f"{len(loaded)} files are loaded from the directory")
            documents.extend(loaded)

        except Exception as e:  # noqa: BLE001
            print(f"Failed to load document: {e}")
    return documents
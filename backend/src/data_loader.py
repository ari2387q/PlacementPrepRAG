from pathlib import Path
from typing import List,Any
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.document_loaders import Docx2txtLoader
from langchain_community.document_loaders.excel import UnstructuredExcelLoader
from langchain_community.document_loaders import JSONLoader

def load_all_documents(data_dir:str)-> List[Any]:
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

        except Exception as e:
            print(f"failed to load the pdf")
    return documents
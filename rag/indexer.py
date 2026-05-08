import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_mistralai import MistralAIEmbeddings
from langchain_community.vectorstores import FAISS

load_dotenv()

DATA_DIR = Path(__file__).parent.parent / "data"
INDEX_DIR = Path(__file__).parent / "faiss_index"

FILE_METADATA = {
    "pcap_criteria.txt":    {"source": "pcap_criteria",    "doc_type": "criteria"},
    "ppt_requirements.txt": {"source": "ppt_requirements", "doc_type": "requirements"},
    "supplier_a.txt":       {"source": "supplier_a",       "doc_type": "proposal"},
    "supplier_b.txt":       {"source": "supplier_b",       "doc_type": "proposal"},
    "supplier_c.txt":       {"source": "supplier_c",       "doc_type": "proposal"},
}


def build_index():
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    all_chunks = []

    for filename, meta in FILE_METADATA.items():
        path = DATA_DIR / filename
        loader = TextLoader(str(path), encoding="utf-8")
        docs = loader.load()
        chunks = splitter.split_documents(docs)
        for chunk in chunks:
            chunk.metadata.update(meta)
        print(f"  {filename}: {len(chunks)} chunks")
        all_chunks.extend(chunks)

    print(f"Total chunks: {len(all_chunks)}")

    embeddings = MistralAIEmbeddings(model="mistral-embed")
    vectorstore = FAISS.from_documents(all_chunks, embeddings)
    vectorstore.save_local(str(INDEX_DIR))
    print(f"Index saved to {INDEX_DIR}")


if __name__ == "__main__":
    build_index()

/**
 * SourceChunksPanel
 * -----------------
 * Right-hand panel of the split-screen review mode.
 * Fetches and displays the raw RAG source excerpts from the supplier's
 * proposal document that were most relevant to the current criterion.
 * Results are cached in React Query so navigating back doesn't re-fetch.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchSourceChunks } from '../api/sourceChunks'
import Spinner from './Spinner'

interface SourceChunksPanelProps {
  tenderId: string
  supplierId: string
  criterionId: string
  criterionName: string
  supplierName: string
}

export default function SourceChunksPanel({
  tenderId,
  supplierId,
  criterionId,
  criterionName,
  supplierName,
}: SourceChunksPanelProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['source-chunks', tenderId, supplierId, criterionId],
    queryFn: () => fetchSourceChunks(tenderId, supplierId, criterionId),
    staleTime: Infinity, // proposal text never changes in a session
  })

  return (
    <div className="h-full flex flex-col">

      {/* Panel header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A81B0F]" />
          <p className="text-[11px] font-bold text-[#A81B0F] uppercase tracking-widest">
            Source Document
          </p>
        </div>
        <p className="text-sm font-semibold text-gray-800">{supplierName}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Proposal excerpts relevant to: <span className="italic">{criterionName}</span>
        </p>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <Spinner label="Fetching source excerpts…" />
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-500 text-sm">Could not load source excerpts.</p>
        </div>
      )}

      {data && (
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {data.chunks.length === 0 ? (
            <div className="p-6 bg-gray-50 rounded-xl border border-gray-100 text-center">
              <p className="text-gray-400 text-sm italic">
                No relevant passages found in this supplier's proposal for this criterion.
              </p>
            </div>
          ) : (
            data.chunks.map((chunk, i) => (
              <div
                key={i}
                className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden"
              >
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-[10px] font-bold text-[#A81B0F] uppercase tracking-widest">
                    Excerpt {i + 1}
                  </span>
                  <span className="ml-auto text-[10px] text-gray-400 font-mono">
                    {chunk.source}
                  </span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {chunk.text}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

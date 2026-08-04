import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { repository } from '../../lib/db'
import type { Paper, Note } from '../../lib/db/types'

export const paperKeys = { all: ['papers'] as const }
export const noteKeys = { all: ['notes'] as const }

export function usePapers() { return useQuery({ queryKey: paperKeys.all, queryFn: () => repository.listPapers() }) }
export function usePaperMutations() {
  const qc = useQueryClient(); const inv = () => qc.invalidateQueries({ queryKey: paperKeys.all })
  return {
    create: useMutation({ mutationFn: (input: Omit<Paper, 'id' | 'createdAt'>) => repository.createPaper(input), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Paper> }) => repository.updatePaper(id, patch), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => repository.deletePaper(id), onSuccess: inv }),
  }
}

export function useNotes() { return useQuery({ queryKey: noteKeys.all, queryFn: () => repository.listNotes(), select: ns => ns.filter(n => !n.archived) }) }
export function useNoteMutations() {
  const qc = useQueryClient(); const inv = () => qc.invalidateQueries({ queryKey: noteKeys.all })
  return {
    create: useMutation({ mutationFn: ({ content, tag }: { content: string; tag?: string | null }) => repository.createNote(content, tag), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Note> }) => repository.updateNote(id, patch), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => repository.deleteNote(id), onSuccess: inv }),
  }
}

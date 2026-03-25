import { Toaster } from 'sonner'

export function AppToaster() {
  return (
    <Toaster
      richColors
      position="top-center"
      closeButton
      expand
      toastOptions={{
        classNames: {
          toast: '!rounded-panel !border !border-slate-200 !shadow-medium !bg-white',
          title: '!text-slate-900 !font-semibold',
          description: '!text-slate-600'
        }
      }}
    />
  )
}


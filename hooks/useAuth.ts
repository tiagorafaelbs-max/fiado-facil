import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Session, User } from '@supabase/supabase-js'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [usuario, setUsuario] = useState<User | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    // Timeout de segurança: se o Supabase não responder em 6s, libera o app
    const timeout = setTimeout(() => setCarregando(false), 6000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      setSession(session)
      setUsuario(session?.user ?? null)
      setCarregando(false)
    }).catch(() => {
      clearTimeout(timeout)
      setCarregando(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUsuario(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function entrar(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) throw error
  }

  async function cadastrar(email: string, senha: string, nomeNegocio: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome_negocio: nomeNegocio } },
    })
    if (error) throw error
    return data
  }

  async function sair() {
    await supabase.auth.signOut()
  }

  async function recuperarSenha(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'fiadofacil://nova-senha',
    })
    if (error) throw error
  }

  return { session, usuario, carregando, entrar, cadastrar, sair, recuperarSenha }
}

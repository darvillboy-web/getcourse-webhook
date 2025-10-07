import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://rvbprlcztmvlyvbrwrhg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2YnBybGN6dG12bHl2YnJ3cmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzODMzODksImV4cCI6MjA3NDk1OTM4OX0.mIK9JgFwdE9flfKpkqg0itrgE8_aHqzO8e9_qx6GUdg'
)

export default async function handler(req, res) {
  // Разрешаем CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { type, ...data } = req.body
    console.log('📨 Received:', type)

    let result
    if (type === 'registration') {
      result = await supabase.from('users').insert(data)
    } else if (type === 'lesson_action') {
      result = await supabase.from('lesson_actions').insert(data)
    } else if (type === 'survey_answer') {
      result = await supabase.from('survey_answers').insert(data)
    } else {
      return res.status(400).json({ error: 'Unknown type' })
    }

    if (result.error) {
      console.error('❌ Supabase error:', result.error)
      return res.status(500).json({ error: result.error.message })
    }

    console.log('✅ Data inserted:', type)
    res.status(200).json({ success: true })
    
  } catch (error) {
    console.error('💥 Server error:', error)
    res.status(500).json({ error: error.message })
  }
}

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
      const formattedData = {
        user_id: data.userId,
        user_name: data.userName,
        email: data.email,
        account_id: data.accountId,
        account_title: data.accountTitle,
        ts64: data.ts64,
        timestamp: data.timestamp,
        invite_type: data.inviteType,
        utm_source: data.utmSource,
        utm_medium: data.utmMedium,
        utm_campaign: data.utmCampaign,
        utm_content: data.utmContent,
        utm_term: data.utmTerm,
        partner_code_id: data.partnerCodeId,
        ad_offer_id: data.adOfferId
      }
      result = await supabase.from('users').insert(formattedData)
    }

    else if (type === 'lesson_action') {
      const formattedData = {
        user_id: data.userId,
        user_name: data.userName,
        full_user_id: data.fullUserId,
        lesson_id: data.lessonId,
        lesson_title: data.lessonTitle,
        lesson_number: data.lessonNumber,
        training_id: data.trainingId,
        training_name: data.trainingName,
        action_type: data.actionType,
        answer_text: data.answerText,
        question_title: data.questionTitle,
        account_title: data.accountTitle,
        ts64: data.ts64,
        timestamp: data.timestamp
      }
      result = await supabase.from('lesson_actions').insert(formattedData)
    }

    else if (type === 'survey_answer') {
      const formattedData = {
        user_id: data.userId,
        user_name: data.userName,
        full_user_id: data.fullUserId,
        survey_id: data.surveyId,
        form_id: data.formId,
        group_id: data.groupId,
        responses: data.responses,
        responses_raw: data.responsesRaw,
        account_title: data.accountTitle,
        ts64: data.ts64,
        timestamp: data.timestamp
      }
      result = await supabase.from('survey_answers').insert(formattedData)
    }

    else {
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

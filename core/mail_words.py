"""The words an email has in the language of its reader: the fixed lines of the template, and the contact emails.

Only the emails that answer the contact form are sent in French or Kinyarwanda. Every other email is English and uses the
English words here, which are the lines the template always had. French and Kinyarwanda are drafts until a native speaker
has read them, like every other text in those languages.
"""

WORDS = {
    'en': {
        'sign_off': 'The SSMS team',
        'privacy': 'Privacy',
        'terms': 'Terms',
        'button_help': 'If the button does not work, copy this address into your browser:',
        'reply_heading': 'Our reply to your message',
        'reply_greeting': 'Hello,',
        'reply_wrote': 'You wrote to us on {date}.',
        'reply_reason': 'You received this because you wrote to us on the SSMS contact form.',
    },
    'fr': {
        'sign_off': "L'équipe SSMS",
        'privacy': 'Confidentialité',
        'terms': 'Conditions',
        'button_help': 'Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :',
        'reply_heading': 'Notre réponse à votre message',
        'reply_greeting': 'Bonjour,',
        'reply_wrote': 'Vous nous avez écrit le {date}.',
        'reply_reason': 'Vous recevez ce message parce que vous nous avez écrit avec le formulaire de contact de SSMS.',
    },
    'rw': {
        'sign_off': 'Itsinda rya SSMS',
        'privacy': 'Ibanga',
        'terms': 'Amabwiriza',
        'button_help': 'Niba buto idakora, kopera iyi aderesi muri mushakisha yawe:',
        'reply_heading': 'Igisubizo ku butumwa bwawe',
        'reply_greeting': 'Muraho,',
        'reply_wrote': 'Watwandikiye ku wa {date}.',
        'reply_reason': 'Wakiriye ubu butumwa kubera ko watwandikiye ukoresheje ifishi yo kutwandikira ya SSMS.',
    },
}

<?php

// Dutch validation messages for the rules PlainShow uses; others fall back to English.
return [
    'accepted' => ':Attribute moet geaccepteerd worden.',
    'after' => ':Attribute moet na :date liggen.',
    'array' => ':Attribute moet een lijst zijn.',
    'before' => ':Attribute moet voor :date liggen.',
    'boolean' => ':Attribute moet aan of uit zijn.',
    'confirmed' => 'De herhaling van :attribute komt niet overeen.',
    'current_password' => 'Het wachtwoord klopt niet.',
    'email' => ':Attribute moet een geldig e-mailadres zijn.',
    'exists' => 'De gekozen :attribute bestaat niet.',
    'image' => ':Attribute moet een afbeelding zijn.',
    'in' => 'De gekozen :attribute is niet geldig.',
    'integer' => ':Attribute moet een geheel getal zijn.',
    'max' => [
        'array' => ':Attribute mag niet meer dan :max items hebben.',
        'file' => ':Attribute mag niet groter zijn dan :max kilobytes.',
        'numeric' => ':Attribute mag niet groter zijn dan :max.',
        'string' => ':Attribute mag niet meer dan :max tekens hebben.',
    ],
    'mimes' => ':Attribute moet een bestand zijn van het type: :values.',
    'min' => [
        'array' => ':Attribute moet minstens :min items hebben.',
        'file' => ':Attribute moet minstens :min kilobytes zijn.',
        'numeric' => ':Attribute moet minstens :min zijn.',
        'string' => ':Attribute moet minstens :min tekens hebben.',
    ],
    'numeric' => ':Attribute moet een getal zijn.',
    'present' => ':Attribute moet aanwezig zijn.',
    'regex' => 'De vorm van :attribute is niet geldig.',
    'required' => ':Attribute is verplicht.',
    'size' => [
        'string' => ':Attribute moet :size tekens hebben.',
        'numeric' => ':Attribute moet :size zijn.',
    ],
    'string' => ':Attribute moet tekst zijn.',
    'unique' => 'Deze :attribute is al in gebruik.',
    'url' => ':Attribute moet een geldige link zijn.',
    'attributes' => [
        'name' => 'naam', 'color' => 'kleur', 'username' => 'gebruikersnaam', 'firstName' => 'voornaam', 'lastName' => 'achternaam',
        'email' => 'e-mail', 'password' => 'wachtwoord', 'current_password' => 'huidig wachtwoord', 'code' => 'code', 'role' => 'rol',
        'status' => 'status', 'title' => 'titel', 'url' => 'link', 'userId' => 'persoon', 'confirmUsername' => 'gebruikersnaam',
    ],
];

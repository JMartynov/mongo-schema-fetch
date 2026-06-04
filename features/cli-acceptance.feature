Feature: CLI runs against different MongoDB versions and configurations
  As a developer or automated system
  I want to run mongo-schema-fetch against various versions and configurations of MongoDB
  So that I can verify compatibility and correctness of the extracted schema

  Scenario Outline: Fetch schema from MongoDB <version> in <config> configuration
    Given a running MongoDB "<version>" container in "<config>" configuration
    And the database has collection "users" with documents:
      | name    | age | role  |
      | Alice   | 30  | admin |
      | Bob     | 25  | user  |
      | Charlie | 35  | user  |
    When I run mongo-schema-fetch with "--all-collections" and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"
    And the field "role" in "users" should have enum values "admin" and "user"
    And the field "role" in "users" should not leak any values
    And the output payload should have buildInfo version matching "<version>"

    Examples:
      | version   | config      |
      | mongo:5.0 | standalone  |
      | mongo:6.0 | standalone  |
      | mongo:7.0 | standalone  |
      | mongo:8.0 | standalone  |
      | mongo:7.0 | auth        |

  Scenario: Fetch schema from MongoDB with secondaryPreferred read preference
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with "--read-preference secondaryPreferred --all-collections" and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario Outline: Fetch schema from MongoDB replica set cluster
    Given a running MongoDB "<version>" replica set cluster container
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
      | Bob   | 25  | user  |
    When I run mongo-schema-fetch with "--all-collections" and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"
    And the field "role" in "users" should have enum values "admin" and "user"
    And the output payload should have buildInfo version matching "<version>"

    Examples:
      | version   |
      | mongo:6.0 |
      | mongo:7.0 |
      | mongo:8.0 |

  Scenario: Fetch schema from authenticated MongoDB using command-line username and password arguments
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with username and password parameters and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from authenticated MongoDB fails if wrong username and password parameters are provided
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with wrong username and password parameters and quiet mode
    Then the exit code should be 1

  Scenario: Fetch schema from TLS-enabled MongoDB using TLS options and CA verification
    Given a running MongoDB container with TLS enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS and CA verification and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from TLS-enabled MongoDB using TLS mutual authentication
    Given a running MongoDB container with TLS enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS and mutual authentication and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from TLS-enabled MongoDB fails if CA verification is required but not provided
    Given a running MongoDB container with TLS enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS but no CA verification and quiet mode
    Then the exit code should be 1

  Scenario: Fetch schema from TLS-enabled MongoDB succeeds if invalid CA verification is bypassed
    Given a running MongoDB container with TLS enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS and invalid CA verification bypassed and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from TLS-enabled MongoDB succeeds if mismatching hostname is bypassed
    Given a running MongoDB container with TLS enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS and mismatching hostname allowed and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from authenticated MongoDB using custom authSource and authMechanism arguments
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with username, password, authSource, and authMechanism parameters and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from TLS-enabled MongoDB using password-encrypted client certificate
    Given a running MongoDB container with TLS enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS, mutual authentication, and encrypted client certificate password and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from authenticated MongoDB using password from environment variable
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with username parameter and password in environment and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from authenticated MongoDB using all extended connection options
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with all extended connection options and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from TLS-enabled MongoDB using MONGODB-X509 authentication
    Given a running MongoDB container with TLS and MONGODB-X509 auth enabled
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with TLS and MONGODB-X509 authentication and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from authenticated MongoDB using explicit SCRAM-SHA-1 authMechanism
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with username, password, authSource, and SCRAM-SHA-1 authMechanism parameters and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"

  Scenario: Fetch schema from authenticated MongoDB using password from MONGODB_PASS environment variable
    Given a running MongoDB "mongo:7.0" container in "auth" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    When I run mongo-schema-fetch with username parameter and password in MONGODB_PASS environment and quiet mode
    Then the exit code should be 0
    And the output payload should contain collection "users"


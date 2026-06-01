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
